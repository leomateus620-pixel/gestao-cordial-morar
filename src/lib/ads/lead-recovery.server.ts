import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdProviderError } from "./types";
import { externalId, metaGraph, safeNextUrl, metaGraphVersion } from "./meta.graph.server";
import { resolvePageCredential } from "./credentials.server";
import { leadRetryPolicy } from "./leadgen.fields";

type RecoveryLead = {
  id: string;
  form_id?: string;
  created_time: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
};
/** Recovery only stores identifiers. Existing leased lead worker fetches PII and transacts the CRM. */
export function recoveryEvents(
  rows: RecoveryLead[],
  pageId: string,
  formId: string,
  since: string,
  until: string,
) {
  return rows
    .filter((r) => {
      if (r.form_id && r.form_id !== formId)
        throw new AdProviderError("no_permission", "Formulário divergente.");
      if (!Number.isFinite(Date.parse(r.created_time)))
        throw new AdProviderError("partial_data", "Data ausente.");
      return (
        Date.parse(r.created_time) >= Date.parse(since) &&
        Date.parse(r.created_time) <= Date.parse(until)
      );
    })
    .map((r) => ({
      leadgen_id: externalId(r.id),
      page_id: pageId,
      form_id: formId,
      created_time: r.created_time,
      ...(r.ad_id ? { ad_id: externalId(r.ad_id) } : {}),
      ...(r.adset_id ? { adset_id: externalId(r.adset_id) } : {}),
      ...(r.campaign_id ? { campaign_id: externalId(r.campaign_id) } : {}),
    }));
}
export async function runMetaLeadRecoveryWorker(db: SupabaseClient) {
  const worker = randomUUID();
  const { data: jobs, error } = await db.rpc("meta_lead_recovery_claim", { p_worker: worker });
  // Migration is additive: legacy worker continues receiving leads before recovery is installed.
  if (error?.code === "PGRST202" || error?.code === "42883")
    return { processed: 0, unavailable: true };
  if (error) return { processed: 0, error: "recovery_claim_failed" };
  const job = jobs?.[0];
  if (!job) return { processed: 0 };
  try {
    const { data: mapping, error: mappingError } = await db
      .from("meta_lead_form_mappings")
      .select("connection_id,page_id,form_id,imobiliaria,enabled")
      .eq("id", job.mapping_id)
      .single();
    if (mappingError || !mapping?.enabled)
      throw new AdProviderError("no_permission", "Mapeamento indisponível.");
    const { data: allowed, error: accessError } = await db.rpc("marketing_actor_can_act", {
      p_actor: job.requested_by,
      p_action: "manage_connection",
      p_agency: mapping.imobiliaria,
    });
    if (accessError || allowed !== true)
      throw new AdProviderError("no_permission", "Permissão revogada.");
    const { token, connection } = await resolvePageCredential(mapping.connection_id);
    if (connection.page_id !== mapping.page_id || connection.imobiliaria !== mapping.imobiliaria)
      throw new AdProviderError("no_permission", "Conexão divergente.");
    const path = `/${externalId(mapping.form_id)}/leads`;
    const result = await metaGraph<{
      data: RecoveryLead[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      path,
      token,
      {
        fields: "id,form_id,created_time,ad_id,adset_id,campaign_id",
        limit: "100",
        filtering: JSON.stringify([
          {
            field: "time_created",
            operator: "GREATER_THAN",
            value: Math.floor(Date.parse(job.range_start) / 1000) - 1,
          },
        ]),
        ...(job.cursor_after ? { after: job.cursor_after } : {}),
      },
      {},
      { scopeKey: mapping.connection_id },
    );
    if (!Array.isArray(result.data) || result.data.length > 100)
      throw new AdProviderError("partial_data", "Página inválida.");
    let after: string | null = null;
    if (result.paging?.next) {
      const next = safeNextUrl(result.paging.next);
      if (next.pathname !== `/${metaGraphVersion()}${path}`)
        throw new AdProviderError("no_permission", "Paginação divergente.");
      after = result.paging.cursors?.after ?? next.searchParams.get("after");
      if (!after || after.length > 4096 || after === job.cursor_after)
        throw new AdProviderError("partial_data", "Cursor inválido.");
    }
    const events = recoveryEvents(
      result.data,
      mapping.page_id,
      mapping.form_id,
      job.range_start,
      job.range_end,
    );
    const { error: commitError } = await db.rpc("meta_lead_recovery_commit", {
      p_job: job.id,
      p_worker: worker,
      p_events: events,
      p_after: after,
    });
    if (commitError)
      throw new AdProviderError("provider_error", "Não foi possível salvar a página.");
    return { processed: events.length, hasMore: after !== null };
  } catch (failure) {
    const code = failure instanceof AdProviderError ? failure.code : "provider_error";
    const retry = leadRetryPolicy(code, job.attempts);
    await db
      .from("meta_lead_recovery_jobs")
      .update({
        status: retry.terminal || job.attempts >= 6 ? "failed" : "queued",
        error_code: code,
        worker_id: null,
        lease_until: null,
        next_attempt_at: new Date(Date.now() + retry.delaySeconds * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("worker_id", worker)
      .eq("status", "processing")
      .gt("lease_until", new Date().toISOString());
    return { processed: 0, error: code };
  }
}
