/**
 * Observação periódica por publicação. O plano de três estados decide campos
 * seguros para importar; divergências permanecem explícitas. Uma leitura não
 * altera disponibilidade nem transforma pendências em "published".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPropertyDetail } from "./read.server";
import { normalizeRemoteProperty, toPropertyRow } from "./import-normalizers";
import { sha256 } from "./import.server";
import { applyRemoteChanges } from "./remote-changes.server";
import { sanitizeMessage, toImobiError } from "./errors";
import type { ImobiProvider } from "./providers";

type Admin = SupabaseClient;
export type ReconcileOutcome = "synced" | "out_of_sync" | "missing_remote" | "skipped";

function comparableRemoteRow(remote: ReturnType<typeof normalizeRemoteProperty>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(toPropertyRow(remote)).filter(([, value]) => value !== null && value !== undefined));
}

export async function runReconcileSweep(admin: Admin, options: { limit?: number } = {}) {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const { data: publications, error } = await admin
    .from("property_provider_publications")
    .select("id, property_id, provider, external_property_id, enabled, status")
    .not("external_property_id", "is", null)
    .eq("enabled", true)
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const summary: Record<ReconcileOutcome, number> = {
    synced: 0, out_of_sync: 0, missing_remote: 0, skipped: 0,
  };
  for (const candidate of publications ?? []) {
    const provider = candidate.provider as ImobiProvider;
    const externalId = candidate.external_property_id as string;
    const now = new Date().toISOString();
    try {
      const detail = await fetchPropertyDetail(provider, externalId);
      const remote = normalizeRemoteProperty(provider, externalId, detail);
      const remoteHash = await sha256(JSON.stringify(remote));
      let outcome: Awaited<ReturnType<typeof applyRemoteChanges>> | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const [{ data: local, error: localError }, { data: publication, error: pubError }] = await Promise.all([
          admin.from("properties").select("*").eq("id", candidate.property_id).single(),
          admin.from("property_provider_publications")
            .select("id, property_id, provider, enabled, external_property_id, updated_at, confirmed_field_snapshot, echo_payload_hash, echo_expires_at, status")
            .eq("id", candidate.id).single(),
        ]);
        if (localError || pubError || !local || !publication) {
          throw new Error(localError?.message ?? pubError?.message ?? "Publicação indisponível.");
        }
        if (!publication.enabled || publication.external_property_id !== externalId) {
          summary.skipped += 1;
          break;
        }
        try {
          outcome = await applyRemoteChanges(admin, {
            publication: publication as never,
            localRow: local as Record<string, unknown>,
            remote,
            remoteHash,
            remoteObservedAt: now,
            observeOther: async (otherProvider, otherExternalId) => {
              const other = await fetchPropertyDetail(otherProvider as ImobiProvider, otherExternalId);
              return comparableRemoteRow(normalizeRemoteProperty(otherProvider as ImobiProvider, otherExternalId, other));
            },
          });
          break;
        } catch (mergeError) {
          if (attempt === 2 || !/revision_changed|publication_changed|other_publication_changed/.test(String(mergeError))) throw mergeError;
        }
      }
      if (!outcome) continue;
      const repairFields = [...new Set([
        ...outcome.report.localPending.map((field) => field.field),
        ...outcome.report.localClears.map((field) => field.field),
      ])];
      if (repairFields.length) {
        const { error: repairError } = await admin.rpc("property_sync_request_repair" as never, {
          _property_id: candidate.property_id,
          _provider: provider,
          _fields: repairFields,
        } as never);
        if (repairError) throw new Error(repairError.message);
      }
      if (outcome.fullyConfirmed && outcome.conflicts.length === 0) {
        summary.synced += 1;
      } else {
        summary.out_of_sync += 1;
        // Uma publicação já sinalizada como pendente/parcial/bloqueada mantém
        // seu estado. Só uma publicação antes considerada concluída muda.
        if (candidate.status === "published") {
          const { error: statusError } = await admin.from("property_provider_publications")
            .update({ status: "out_of_sync" }).eq("id", candidate.id)
            .eq("status", "published");
          if (statusError) throw new Error(statusError.message);
        }
      }
    } catch (failure) {
      const normalized = toImobiError(failure);
      const missing = normalized.httpStatus === 404;
      if (missing) summary.missing_remote += 1;
      else summary.skipped += 1;
      const { error: updateError } = await admin.from("property_provider_publications")
        .update({
          last_verified_at: now,
          remote_read_state: missing ? "missing_remote_suspeito" : "leitura_falhou",
          last_error_category: missing ? "missing_remote" : normalized.category,
          last_error_message: missing
            ? "O anúncio não apareceu na leitura. Ausência não autoriza recriação nem exclusão."
            : sanitizeMessage(normalized.message, 200),
        })
        .eq("id", candidate.id);
      if (updateError) throw new Error(updateError.message);
    }
  }
  return { checked: (publications ?? []).length, ...summary };
}
