/**
 * Reconciliação periódica READ-ONLY.
 *
 * Compara três hashes determinísticos — o observado no site, o último publicado
 * pelo sistema e o desejado localmente — e apenas CLASSIFICA. Nada do cadastro
 * local é sobrescrito: divergência vira alerta para o administrador decidir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPropertyDetail } from "./read.server";
import { normalizeRemoteProperty } from "./import-normalizers";
import { extractPublicUrl } from "./public-url";
import { sha256 } from "./import.server";
import { sanitizeMessage, toImobiError } from "./errors";
import { isOwnEcho } from "./tri-state";
import type { ImobiProvider } from "./providers";

type Admin = SupabaseClient;

export type ReconcileOutcome = "synced" | "out_of_sync" | "missing_remote" | "skipped";

export async function runReconcileSweep(admin: Admin, options: { limit?: number } = {}) {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));

  const { data: publications, error } = await admin
    .from("property_provider_publications")
    .select(
      "id, property_id, provider, external_property_id, external_public_url, last_published_hash, remote_observed_hash, echo_payload_hash, echo_expires_at",
    )
    .not("external_property_id", "is", null)
    .eq("enabled", true)
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const summary: Record<ReconcileOutcome, number> = {
    synced: 0,
    out_of_sync: 0,
    missing_remote: 0,
    skipped: 0,
  };

  for (const publication of publications ?? []) {
    const provider = publication.provider as ImobiProvider;
    const externalId = publication.external_property_id as string;
    const now = new Date().toISOString();
    try {
      const detail = await fetchPropertyDetail(provider, externalId);
      if (!detail || Object.keys(detail).length === 0) {
        // Ausência NUNCA remove nada do Gestão: pode ser imóvel inativo, filtro
        // da consulta ou leitura parcial. Fica como suspeita para conferência.
        summary.missing_remote += 1;
        await admin
          .from("property_provider_publications")
          .update({
            status: "out_of_sync",
            last_verified_at: now,
            remote_read_state: "missing_remote_suspeito",
            last_error_category: "missing_remote",
            last_error_message:
              "O anúncio não apareceu na consulta ao site. Pode estar inativo ou fora do filtro — nada foi removido do Gestão.",
          })
          .eq("id", publication.id);
        continue;
      }

      const remoteHash = await sha256(
        JSON.stringify(normalizeRemoteProperty(provider, externalId, detail)),
      );
      // `last_published_hash` vive no MESMO espaço normalizado de `remoteHash`
      // (`normalizeRemoteProperty`). `last_payload_hash` é o hash do corpo
      // enviado e não serve para essa comparação — ver docs/IMOBI-ESTADOS-SINCRONIZACAO.md.
      const baseline = publication.last_published_hash as string | null;
      const echo = isOwnEcho(remoteHash, {
        hash: publication.echo_payload_hash as string | null,
        expiresAt: publication.echo_expires_at as string | null,
      });
      const drifted = !echo && Boolean(baseline) && baseline !== remoteHash;
      const publicUrl = extractPublicUrl(provider, detail, externalId);

      await admin
        .from("property_provider_publications")
        .update({
          remote_observed_hash: remoteHash,
          remote_snapshot_at: now,
          remote_read_state: "lido",
          // Eco do próprio envio confirma a publicação em vez de virar "alterado fora".
          ...(echo ? { last_published_hash: remoteHash, baseline_at: now } : {}),
          status: drifted ? "out_of_sync" : "published",
          last_verified_at: now,
          // Preenche o link canônico apenas quando o site o devolveu; nunca apaga um link válido.
          ...(publicUrl ? { external_public_url: publicUrl } : {}),
          last_error_category: drifted ? "drift" : null,
          last_error_message: drifted
            ? "O imóvel foi alterado no site fora do Gestão Cordial. Escolha reaplicar a versão do sistema ou importar a alteração."
            : null,
        })
        .eq("id", publication.id);

      if (drifted) summary.out_of_sync += 1;
      else summary.synced += 1;
    } catch (error) {
      summary.skipped += 1;
      const normalized = toImobiError(error);
      await admin
        .from("property_provider_publications")
        .update({
          last_verified_at: now,
          // Falha de leitura é falha de leitura: não vira ausência nem remoção.
          remote_read_state: "leitura_falhou",
          last_error_category: normalized.category,
          last_error_message: sanitizeMessage(normalized.message, 200),
        })
        .eq("id", publication.id);
    }
  }

  return { checked: (publications ?? []).length, ...summary };
}
