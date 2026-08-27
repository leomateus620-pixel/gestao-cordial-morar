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
import { sha256 } from "./import.server";
import { sanitizeMessage, toImobiError } from "./errors";
import type { ImobiProvider } from "./providers";

type Admin = SupabaseClient;

export type ReconcileOutcome = "synced" | "out_of_sync" | "missing_remote" | "skipped";

export async function runReconcileSweep(admin: Admin, options: { limit?: number } = {}) {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));

  const { data: publications, error } = await admin
    .from("property_provider_publications")
    .select("id, property_id, provider, external_property_id, last_published_hash, remote_observed_hash")
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
        summary.missing_remote += 1;
        await admin
          .from("property_provider_publications")
          .update({
            status: "out_of_sync",
            last_verified_at: now,
            last_error_category: "missing_remote",
            last_error_message: "Imóvel não localizado no site.",
          })
          .eq("id", publication.id);
        continue;
      }

      const remoteHash = await sha256(
        JSON.stringify(normalizeRemoteProperty(provider, externalId, detail)),
      );
      const baseline = publication.last_published_hash as string | null;
      const drifted = Boolean(baseline) && baseline !== remoteHash;

      await admin
        .from("property_provider_publications")
        .update({
          remote_observed_hash: remoteHash,
          status: drifted ? "out_of_sync" : "published",
          last_verified_at: now,
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
          last_error_category: normalized.category,
          last_error_message: sanitizeMessage(normalized.message, 200),
        })
        .eq("id", publication.id);
    }
  }

  return { checked: (publications ?? []).length, ...summary };
}
