import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { AdProviderError } from "./types";
import {
  metaGraph,
  metaGraphCommand,
  externalId,
  safeNextUrl,
  metaGraphVersion,
} from "./meta.graph.server";
import { resolveConnectionCredential } from "./credentials.server";
import { getMetaAccount } from "./providers/meta.server";
import {
  normalizeEntityInsight,
  type InsightLevel,
  type InsightGrain,
  type InsightBreakdown,
} from "./entity-insights.model";
export type InsightJob = {
  id: string;
  requested_by: string;
  connection_id: string;
  account_id: string;
  imobiliaria: string;
  campaign_id: string;
  external_campaign_id: string;
  level: InsightLevel;
  grain: InsightGrain;
  breakdown: InsightBreakdown;
  since: string;
  until: string;
  status: string;
  report_run_id: string | null;
  after_cursor: string | null;
  currency: string | null;
  timezone: string | null;
  attempts: number;
  api_version: string;
};
export const entityInsightFields =
  "account_id,account_currency,campaign_id,adset_id,ad_id,date_start,date_stop,impressions,clicks,inline_link_clicks,spend,actions,reach,frequency,attribution_setting";
export function insightReportParameters(job: InsightJob): Record<string, string> {
  return {
    level: job.level,
    time_increment: job.grain === "daily" ? "1" : "all_days",
    time_range: JSON.stringify({ since: job.since, until: job.until }),
    fields: entityInsightFields
      .split(",")
      .filter((field) => field !== "ad_id" || job.level === "ad")
      .filter((field) => field !== "adset_id" || job.level !== "campaign")
      .join(","),
    filtering: JSON.stringify([
      { field: "campaign.id", operator: "IN", value: [job.external_campaign_id] },
    ]),
    use_unified_attribution_setting: "true",
    action_report_time: "impression",
    ...(job.breakdown === "none" ? {} : { breakdowns: job.breakdown }),
  };
}
export function classifyInsightReport(
  status: unknown,
): "collecting" | "polling" | "failed" | "expired" {
  if (status === "Job Completed") return "collecting";
  if (status === "Job Failed" || status === "Job Skipped") return "failed";
  if (status === "Job Expired") return "expired";
  if (status === "Job Not Started" || status === "Job Started" || status === "Job Running")
    return "polling";
  throw new AdProviderError("provider_error", "Estado do relatório não reconhecido.");
}
export async function processMetaInsightJob(
  db: SupabaseClient,
  job: InsightJob,
  workerId: string,
): Promise<void> {
  const checkpoint = async (status: string, options: Record<string, unknown> = {}) => {
    const { error } = await db.rpc("meta_insight_checkpoint", {
      p_id: job.id,
      p_worker: workerId,
      p_status: status,
      ...options,
    });
    if (error) throw new Error("insight_checkpoint_failed");
  };
  try {
    const { data: allowed, error: accessError } = await db.rpc("marketing_actor_can_act", {
      p_actor: job.requested_by,
      p_action: "manage_manual",
      p_agency: job.imobiliaria,
    });
    if (accessError || allowed !== true)
      throw new AdProviderError("no_permission", "Permissão de coleta revogada.");
    if (job.api_version !== metaGraphVersion())
      throw new AdProviderError(
        "conflict",
        "Versão Graph mudou; finalize este relatório antes de trocar a versão.",
      );
    const { token } = await resolveConnectionCredential(job.connection_id, {
      platform: "meta",
      imobiliaria: job.imobiliaria,
      accountId: job.account_id,
    });
    if (job.status === "submitting") {
      const account = await getMetaAccount(job.account_id, token);
      if (
        account.account_id !== job.account_id ||
        !/^[A-Z]{3}$/.test(account.currency) ||
        !account.timezone_name
      )
        throw new AdProviderError("no_permission", "Conta incompatível.");
      // The database entered submitting before this POST. Lost lease/response
      // becomes uncertain and is never permission for another report POST.
      const report = await metaGraphCommand<{ report_run_id?: string }>(
        `/act_${externalId(job.account_id)}/insights`,
        token,
        insightReportParameters(job),
        { operation: "report", scopeKey: job.connection_id },
      );
      if (!report.report_run_id || !/^\d{1,80}$/.test(report.report_run_id))
        throw new AdProviderError("outcome_uncertain", "Relatório sem identificador confirmado.");
      await checkpoint("polling", {
        p_report_id: report.report_run_id,
        p_currency: account.currency,
        p_timezone: account.timezone_name,
      });
      return;
    }
    if (!job.report_run_id)
      throw new AdProviderError("conflict", "Identificador de relatório ausente.");
    if (job.status === "polling") {
      const report = await metaGraph<{
        id: string;
        account_id: string;
        async_status: string;
        async_percent_completion?: number;
      }>(
        `/${externalId(job.report_run_id)}`,
        token,
        { fields: "id,account_id,async_status,async_percent_completion" },
        {},
        { operation: "report", scopeKey: job.connection_id },
      );
      if (report.id !== job.report_run_id || report.account_id !== job.account_id)
        throw new AdProviderError("no_permission", "Relatório de outra conta.");
      const next = classifyInsightReport(report.async_status);
      await checkpoint(next, {
        p_progress: Math.max(0, Math.min(100, Number(report.async_percent_completion) || 0)),
        p_error:
          next === "failed"
            ? "meta_report_failed"
            : next === "expired"
              ? "meta_report_expired"
              : null,
      });
      return;
    }
    if (job.status !== "collecting" || !job.currency || !job.timezone)
      throw new AdProviderError("conflict", "Relatório sem contexto de coleta.");
    const path = `/${externalId(job.report_run_id)}/insights`;
    const page = await metaGraph<{
      data: Array<Record<string, unknown>>;
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      path,
      token,
      { limit: "200", ...(job.after_cursor ? { after: job.after_cursor } : {}) },
      {},
      { operation: "report", scopeKey: job.connection_id },
    );
    if (!Array.isArray(page.data) || page.data.length > 500)
      throw new AdProviderError("partial_data", "Página de relatório incompleta.");
    let next: string | null = null;
    if (page.paging?.next) {
      const url = safeNextUrl(page.paging.next);
      if (url.pathname !== `/${metaGraphVersion()}${path}`)
        throw new AdProviderError("no_permission", "Paginação fora do relatório.");
      next = url.searchParams.get("after");
      if (!next || next.length > 4096)
        throw new AdProviderError("partial_data", "Cursor inválido.");
    }
    let rows;
    try {
      rows = page.data.map((row) =>
        normalizeEntityInsight(row, {
          accountId: job.account_id,
          campaignId: job.external_campaign_id,
          level: job.level,
          grain: job.grain,
          breakdown: job.breakdown,
          since: job.since,
          until: job.until,
          currency: job.currency!,
        }),
      );
    } catch {
      throw new AdProviderError(
        "partial_data",
        "O relatório retornou dados fora do escopo ou inválidos.",
      );
    }
    const { error } = await db.rpc("meta_insight_append", {
      p_id: job.id,
      p_worker: workerId,
      p_expected_after: job.after_cursor,
      p_next_after: next,
      p_rows: rows,
    });
    if (error) throw new AdProviderError("partial_data", "Não foi possível confirmar a página.");
  } catch (error) {
    const code = error instanceof AdProviderError ? error.code : "provider_error";
    const uncertain =
      job.status === "submitting" &&
      (code === "outcome_uncertain" || !(error instanceof AdProviderError));
    // Known report IDs can resume reads. Credentials/permissions/invalid data stop.
    const retry =
      job.status !== "submitting" &&
      ["rate_limited", "provider_error"].includes(code) &&
      job.attempts < 150;
    await checkpoint(uncertain ? "uncertain" : retry ? job.status : "failed", {
      p_error: code,
      p_diagnostics: error instanceof AdProviderError ? (error.diagnostics ?? null) : null,
    });
  }
}
export async function runMetaInsightJobs(limit = 2) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  let processed = 0,
    failed = 0;
  for (let index = 0; index < Math.max(0, Math.min(limit, 2)); index++) {
    const worker = randomUUID();
    const { data, error } = await db.rpc("meta_insight_claim", { p_worker: worker });
    if (error) throw new Error("Não foi possível consultar a fila de relatórios Meta.");
    const job = (data as InsightJob[] | null)?.[0];
    if (!job) break;
    try {
      await processMetaInsightJob(db, job, worker);
      processed++;
    } catch {
      failed++;
    }
  }
  return { processed, failed };
}
/** A report ID by itself is not proof of ownership or matching filters. */
export function reportMatchesInsightScope(
  report: Record<string, unknown>,
  job: InsightJob,
): boolean {
  const range = report.time_range as { since?: string; until?: string } | undefined;
  const filters = report.filtering as
    | Array<{ field?: string; operator?: string; value?: unknown }>
    | undefined;
  const breakdowns = report.breakdowns;
  return (
    report.account_id === job.account_id &&
    report.level === job.level &&
    range?.since === job.since &&
    range.until === job.until &&
    String(report.time_increment) === (job.grain === "daily" ? "1" : "all_days") &&
    report.use_unified_attribution_setting === true &&
    report.action_report_time === "impression" &&
    Array.isArray(breakdowns) &&
    JSON.stringify(breakdowns) ===
      JSON.stringify(job.breakdown === "none" ? [] : [job.breakdown]) &&
    Array.isArray(filters) &&
    filters.length === 1 &&
    filters[0].field === "campaign.id" &&
    filters[0].operator === "IN" &&
    Array.isArray(filters[0].value) &&
    filters[0].value.length === 1 &&
    filters[0].value[0] === job.external_campaign_id
  );
}
