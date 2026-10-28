import process from "node:process";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AdProviderError } from "./types";
import { resolvePageCredential } from "./credentials.server";
import { externalId, metaGraph } from "./meta.graph.server";
import { leadRetryPolicy, mapMetaLeadFields, type MetaFieldMapping } from "./leadgen.fields";
import type { MetaWebhookApp, MetaWebhookEvent } from "./leadgen.webhook.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabaseAdmin as SupabaseClient;
export async function configuredWebhookApps(): Promise<MetaWebhookApp[]> {
  const result = new Map<string, MetaWebhookApp>();
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) return [];
  if (process.env.META_APP_ID && process.env.META_APP_SECRET)
    result.set(process.env.META_APP_ID, {
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      verifyToken,
    });
  const { data, error } = await db
    .from("ad_platform_connections")
    .select("app_id,app_secret_ref")
    .eq("platform", "meta");
  if (error) throw new Error("configuration_unavailable");
  for (const row of data ?? []) {
    if (
      !row.app_id ||
      !row.app_secret_ref ||
      !/^META_(?:[A-Z0-9]+_)*APP_SECRET$/.test(row.app_secret_ref)
    )
      continue;
    const secret = process.env[row.app_secret_ref];
    if (secret) result.set(row.app_id, { appId: row.app_id, appSecret: secret, verifyToken });
  }
  return [...result.values()];
}
export async function persistMetaEvents(appId: string, events: MetaWebhookEvent[]) {
  const { error } = await db.rpc("meta_lead_ingest", { p_app_id: appId, p_events: events });
  if (error) throw new Error("lead_persistence_failed");
}
type ClaimedLead = {
  id: string;
  connection_id: string;
  page_id: string;
  leadgen_id: string;
  form_id: string | null;
  ad_id: string | null;
  adset_id: string | null;
  external_campaign_id: string | null;
  attempts: number;
};
type GraphLead = {
  id: string;
  form_id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  created_time?: string;
  field_data?: unknown;
};
export async function runMetaLeadWorker(limit = 5) {
  const { runMetaLeadRecoveryWorker } = await import("./lead-recovery.server");
  const recovery = await runMetaLeadRecoveryWorker(db);
  const workerId = randomUUID();
  const { data, error } = await db.rpc("meta_lead_claim", {
    p_worker_id: workerId,
    p_limit: Math.max(1, Math.min(10, limit)),
  });
  if (error) throw new Error("lead_claim_failed");
  const results: Record<string, number> = {};
  for (const row of (data ?? []) as ClaimedLead[]) {
    try {
      const { token, connection } = await resolvePageCredential(row.connection_id);
      if (connection.page_id !== row.page_id)
        throw new AdProviderError("no_permission", "page_mismatch");
      const lead = await metaGraph<GraphLead>(`/${externalId(row.leadgen_id)}`, token, {
        fields: "id,form_id,ad_id,adset_id,campaign_id,created_time,field_data",
      });
      if (
        lead.id !== row.leadgen_id ||
        (lead.form_id && row.form_id && lead.form_id !== row.form_id)
      )
        throw new AdProviderError("no_permission", "lead_mismatch");
      const formId = lead.form_id ?? row.form_id;
      const { data: mapping, error: mappingError } = await db.rpc(
        "meta_lead_mapping_for_submission",
        { p_id: row.id, p_worker_id: workerId, p_form_id: formId ?? "" },
      );
      if (mappingError) throw new Error("mapping_unavailable");
      const fields = mapMetaLeadFields(lead.field_data ?? [], (mapping ?? {}) as MetaFieldMapping);
      const { error: metadataError } = await db
        .from("meta_lead_submissions")
        .update({
          form_id: formId,
          ad_id: lead.ad_id ?? row.ad_id,
          adset_id: lead.adset_id ?? row.adset_id,
          external_campaign_id: lead.campaign_id ?? row.external_campaign_id,
          ...(lead.created_time && Number.isFinite(Date.parse(lead.created_time))
            ? { meta_created_at: new Date(lead.created_time).toISOString() }
            : {}),
        })
        .eq("id", row.id)
        .eq("worker_id", workerId)
        .eq("status", "processing")
        .gt("lease_until", new Date().toISOString());
      if (metadataError) throw new Error("metadata_commit_failed");
      const { data: status, error: completeError } = await db.rpc("meta_lead_complete", {
        p_id: row.id,
        p_worker_id: workerId,
        p_fields: fields,
      });
      if (completeError) throw new Error("crm_commit_failed");
      results[String(status)] = (results[String(status)] ?? 0) + 1;
    } catch (failure) {
      const code =
        failure instanceof AdProviderError
          ? failure.code
          : failure instanceof Error && failure.message === "invalid_lead_fields"
            ? "invalid_fields"
            : "provider_error";
      const retry = leadRetryPolicy(code, row.attempts);
      // Only our fixed error taxonomy is stored; provider responses and PII never enter logs.
      const { error: failError } = await db
        .from("meta_lead_submissions")
        .update({
          status: retry.terminal ? "failed" : "queued",
          next_attempt_at: new Date(Date.now() + retry.delaySeconds * 1000).toISOString(),
          lease_until: null,
          worker_id: null,
          last_error: code,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("worker_id", workerId)
        .eq("status", "processing")
        .gt("lease_until", new Date().toISOString());
      if (failError) throw new Error("lead_failure_commit_failed");
      results[retry.terminal ? "failed" : "retry"] =
        (results[retry.terminal ? "failed" : "retry"] ?? 0) + 1;
    }
  }
  return { processed: (data ?? []).length, results, recovery };
}
