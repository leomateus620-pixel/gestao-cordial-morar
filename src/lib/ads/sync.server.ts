import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { AdProviderError, AD_ERROR_MESSAGES } from "./types";
import { resolveConnectionCredential } from "./credentials.server";

export function syncRetry(
  attempt: number,
  code: string,
  random = Math.random,
): { retry: boolean; delayMs: number } {
  const retry = ["provider_error", "rate_limited", "partial_data"].includes(code) && attempt < 6;
  return {
    retry,
    delayMs: Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1)) * (0.8 + random() * 0.4),
  };
}
/** Revisit 28 account-calendar days every six hours for attribution revisions. */
export function recentAccountRange(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (kind: string) => parts.find((p) => p.type === kind)?.value;
  const until = `${value("year")}-${value("month")}-${value("day")}`;
  const since = new Date(Date.parse(`${until}T12:00:00Z`) - 27 * 86400000)
    .toISOString()
    .slice(0, 10);
  return { since, until };
}
async function enqueueRecentRevision(db: SupabaseClient) {
  const { data: due, error } = await db
    .from("marketing_campaigns")
    .select("id,user_id,status,last_synced_at,data_inicio,data_fim,ad_accounts!inner(timezone)")
    .in("platform", ["meta", "google"])
    .eq("sync_status", "synced")
    .lte("last_synced_at", new Date(Date.now() - ACTIVE_REFRESH_MS).toISOString())
    // No account calendar is later than UTC+14; final eligibility uses its own timezone below.
    .lte("data_inicio", new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10))
    .gte("data_fim", new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10))
    .order("last_synced_at", { ascending: true })
    .limit(100);
  if (error) throw new Error("Falha ao consultar revisão incremental.");
  for (const c of due ?? []) {
    if (!isRefreshDue(c)) continue;
    const account = Array.isArray(c.ad_accounts) ? c.ad_accounts[0] : c.ad_accounts;
    let range: { since: string; until: string };
    try {
      if (!account?.timezone) throw new Error("missing_timezone");
      range = recentAccountRange(account.timezone);
    } catch {
      const { error: metadataError } = await db
        .from("marketing_campaigns")
        .update({
          sync_status: "error",
          sync_error: "Fuso da conta ausente ou inválido. Teste a conexão.",
        })
        .eq("id", c.id);
      if (metadataError) throw new Error("Falha ao registrar diagnóstico do fuso da conta.");
      continue;
    }
    range.since = c.data_inicio > range.since ? c.data_inicio : range.since;
    // A scheduled campaign cannot prevent another account/campaign from being refreshed.
    if (range.since > range.until) continue;
    const { error: enqueueError } = await db.rpc("ad_sync_enqueue", {
      p_campaign_id: c.id,
      p_range_start: range.since,
      p_range_end: range.until,
      p_requested_by: c.user_id,
    });
    if (enqueueError) throw new Error("Falha ao agendar revisão incremental.");
    return true;
  }
  return false;
}
/** Active campaigns refresh every cycle (~10 min); paused/ended ones every 6 h. */
export const ACTIVE_REFRESH_MS = 9 * 60000;
export const IDLE_REFRESH_MS = 6 * 3600000;
export function isRefreshDue(
  c: { status: string | null; last_synced_at: string | null },
  now = Date.now(),
) {
  if (!c.last_synced_at) return true;
  const age = now - Date.parse(c.last_synced_at);
  return age >= (c.status === "Ativa" ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS);
}
/**
 * Days already stored with spend/impressions that the provider no longer returns.
 * A non-empty result blocks the commit (which would delete those days): the job is retried
 * and, if it persists, marked `partial` keeping the stored numbers.
 */
export function missingStoredDays(
  stored: { data: string; spend: number | null; impressions: number | null }[],
  returnedDates: string[],
) {
  const back = new Set(returnedDates);
  return stored
    .filter((d) => (Number(d.spend) > 0 || Number(d.impressions) > 0) && !back.has(d.data))
    .map((d) => d.data);
}
const WORKER_MAX_JOBS = 8;
const WORKER_BUDGET_MS = 90000;
/** Runs up to 8 durable jobs per call, one lease at a time, within a 90 s budget. */
export async function runAdsSyncWorker() {
  const started = Date.now();
  const total = { claimed: 0, done: 0, failed: 0, queued: 0 };
  for (let i = 0; i < WORKER_MAX_JOBS && Date.now() - started < WORKER_BUDGET_MS; i++) {
    const r = await runOneAdsSync();
    if (!r.claimed) break;
    total.claimed += r.claimed;
    total.done += r.done;
    total.failed += r.failed;
    total.queued += r.queued;
  }
  return total;
}
/** Claims and completes ONE durable job. */
async function runOneAdsSync() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const workerId = randomUUID();
  let { data: jobs, error } = await db.rpc("ad_sync_claim", { p_worker_id: workerId, p_limit: 1 });
  if (!error && !jobs?.length && (await enqueueRecentRevision(db))) {
    ({ data: jobs, error } = await db.rpc("ad_sync_claim", { p_worker_id: workerId, p_limit: 1 }));
  }
  if (error) throw new Error("Não foi possível reservar a sincronização.");
  const result = { claimed: jobs?.length ?? 0, done: 0, failed: 0, queued: 0 };
  for (const job of jobs ?? []) {
    try {
      const { data: c, error: campaignError } = await db
        .from("marketing_campaigns")
        .select(
          "id,user_id,imobiliaria,platform,connection_id,external_account_id,external_campaign_id,ad_accounts(currency,timezone)",
        )
        .eq("id", job.campaign_id)
        .single();
      if (
        campaignError ||
        !c?.connection_id ||
        !c.external_account_id ||
        !c.external_campaign_id ||
        !["meta", "google"].includes(c.platform)
      )
        throw new AdProviderError("not_connected", "Campanha sem vínculo empresarial.");
      const { token } = await resolveConnectionCredential(c.connection_id, {
        platform: c.platform,
        imobiliaria: c.imobiliaria,
        accountId: c.external_account_id,
      });
      const p =
        c.platform === "meta"
          ? (await import("./providers/meta.server")).metaProvider
          : (await import("./providers/google.server")).googleProvider;
      const range = { since: job.range_start, until: job.range_end };
      const campaign = await p.getCampaign(c.external_account_id, c.external_campaign_id, token);
      const insights = await p.getInsights(
        c.external_account_id,
        c.external_campaign_id,
        range,
        token,
      );
      const period =
        c.platform === "meta"
          ? await (
              await import("./providers/meta.server")
            ).getMetaPeriodInsight(c.external_account_id, c.external_campaign_id, range, token)
          : {
              since: range.since,
              until: range.until,
              accountId: c.external_account_id,
              campaignId: c.external_campaign_id,
              reach: null,
              frequency: null,
              scope: "campaign",
            };
      const { data: stored, error: storedError } = await db
        .from("marketing_daily_metrics")
        .select("data,spend,impressions")
        .eq("campaign_id", c.id)
        .eq("metric_source", "synced")
        .gte("data", range.since)
        .lte("data", range.until);
      if (storedError) throw new AdProviderError("provider_error", "Falha ao ler métricas salvas.");
      if (missingStoredDays(stored ?? [], insights.map((d) => d.date)).length)
        throw new AdProviderError("partial_data", "Resposta incompleta da plataforma.");
      const account = Array.isArray(c.ad_accounts) ? c.ad_accounts[0] : c.ad_accounts;
      const { error: commitError } = await db.rpc("ad_sync_commit", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_metrics: insights.map((d) => ({
          date: d.date,
          impressions: d.impressions,
          reach: c.platform === "meta" ? d.reach : null,
          clicks: d.clicks,
          spend: d.spend,
          leads: d.leads,
          frequency: c.platform === "meta" ? d.frequency : null,
          ctr: d.impressions ? d.ctr : null,
          cpc: d.clicks ? d.cpc : null,
          cpm: d.impressions ? d.cpm : null,
          landing_page_views: d.landingPageViews ?? null,
          provider_actions: d.actions ?? [],
          lead_action_type: d.leadActionType ?? null,
        })),
        p_campaign: {
          nome: campaign.name,
          status: campaign.status,
          period_insights: {
            ...period,
            has_data: insights.length > 0,
            currency: account?.currency ?? null,
            timezone: account?.timezone ?? null,
          },
        },
      });
      if (commitError) {
        const stableConflict =
          commitError.code === "23505" ||
          String(commitError.message).includes("Manual metrics require explicit reconciliation");
        throw new AdProviderError(
          stableConflict ? "conflict" : "provider_error",
          "Não foi possível confirmar o lote.",
        );
      }
      result.done++;
    } catch (e) {
      const code = e instanceof AdProviderError ? e.code : "provider_error";
      const retry = syncRetry(Number(job.attempts), code);
      const now = new Date();
      // The fence prevents an interrupted worker from changing the state of its successor.
      const { error: failError } = await db.rpc("ad_sync_fail", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_status: retry.retry ? "queued" : code === "partial_data" ? "partial" : "error",
        p_error: AD_ERROR_MESSAGES[code],
        p_next_attempt_at: new Date(now.getTime() + retry.delayMs).toISOString(),
      });
      if (!failError) {
        if (retry.retry) result.queued++;
        else result.failed++;
      }
    }
  }
  return result;
}
