import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMarketingAction, type AdsContext } from "./authorization.server";
import type { EntityInsightPage } from "./entity-insights.model";
import { metaGraphVersion } from "./meta.graph.server";
const scopeSchema = z
  .object({
    campaignId: z.uuid(),
    level: z.enum(["campaign", "adset", "ad"]),
    grain: z.enum(["daily", "period"]).default("period"),
    breakdown: z.enum(["none", "publisher_platform"]).default("none"),
    since: z.iso.date(),
    until: z.iso.date(),
  })
  .refine(
    (d) => d.until >= d.since && Date.parse(d.until) - Date.parse(d.since) <= 93 * 86400000,
    "Selecione até 94 datas de calendário.",
  );
export type EntityInsightScope = z.input<typeof scopeSchema>;
async function campaignAccess(ctx: AdsContext, id: string, mutation = false) {
  const access = await requireMarketingAction(ctx, mutation ? "manage_manual" : "read_metrics");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const { data, error } = await db
    .from("marketing_campaigns")
    .select("id,platform,imobiliaria,connection_id,external_account_id")
    .eq("id", id)
    .maybeSingle();
  if (
    error ||
    !data ||
    data.platform !== "meta" ||
    !data.connection_id ||
    !data.external_account_id
  )
    throw new Error("Campanha Meta com conexão e conta é necessária.");
  await requireMarketingAction(ctx, mutation ? "manage_manual" : "read_metrics", data.imobiliaria);
  return { db, access };
}
/** This creates only a reporting job; no ad delivery or budget is changed. */
export const enqueueMetaEntityInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: EntityInsightScope) => scopeSchema.parse(value))
  .handler(async ({ context, data }) => {
    const { db } = await campaignAccess(context, data.campaignId, true);
    const { data: id, error } = await db.rpc("meta_insight_enqueue", {
      p_campaign: data.campaignId,
      p_actor: context.userId,
      p_level: data.level,
      p_grain: data.grain,
      p_breakdown: data.breakdown,
      p_since: data.since,
      p_until: data.until,
      p_api_version: metaGraphVersion(),
    });
    if (error || typeof id !== "string")
      throw new Error("Não foi possível agendar o relatório da Meta.");
    return { id };
  });
export const listMetaEntityInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: EntityInsightScope & { page?: number; pageSize?: number }) =>
    scopeSchema
      .and(
        z.object({
          page: z.number().int().min(1).max(10000).default(1),
          pageSize: z.number().int().min(1).max(100).default(25),
        }),
      )
      .parse(value),
  )
  .handler(async ({ context, data }): Promise<EntityInsightPage> => {
    await requireMarketingAction(context, "read_metrics");
    // The authenticated SECURITY DEFINER RPC fixes scope + financial masking in one snapshot.
    const { data: page, error } = await (context.supabase as SupabaseClient).rpc(
      "meta_insight_snapshot",
      {
        p_campaign: data.campaignId,
        p_level: data.level,
        p_grain: data.grain,
        p_breakdown: data.breakdown,
        p_since: data.since,
        p_until: data.until,
        p_page: data.page,
        p_page_size: data.pageSize,
      },
    );
    if (error || !page) throw new Error("Não foi possível consultar os resultados deste escopo.");
    return page as EntityInsightPage;
  });
export const cancelMetaEntityInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => z.object({ id: z.uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    await requireMarketingAction(context, "manage_manual");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    // This service-only RPC revalidates actor and agency inside the same transaction.
    const { error } = await db.rpc("meta_insight_cancel", {
      p_id: data.id,
      p_actor: context.userId,
    });
    if (error) throw new Error("Não foi possível interromper esta coleta.");
    return { ok: true as const, externalReportDeleted: false as const };
  });
/** Administrative reconciliation performs GET only; it never resubmits the report POST. */
export const reconcileMetaEntityInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string; reportRunId: string }) =>
    z.object({ id: z.uuid(), reportRunId: z.string().regex(/^\d{1,80}$/) }).parse(value),
  )
  .handler(async ({ context, data }) => {
    await requireMarketingAction(context, "manage_connection");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const { data: stored, error } = await db
      .from("meta_insight_jobs")
      .select("*")
      .eq("id", data.id)
      .eq("status", "uncertain")
      .maybeSingle();
    if (error || !stored) throw new Error("Coleta incerta não encontrada.");
    const { reportMatchesInsightScope } = await import("./entity-insights.server");
    const job = stored as import("./entity-insights.server").InsightJob;
    await requireMarketingAction(context, "manage_connection", job.imobiliaria);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { metaGraph, externalId } = await import("./meta.graph.server");
    const { getMetaAccount } = await import("./providers/meta.server");
    const { token } = await resolveConnectionCredential(job.connection_id, {
      platform: "meta",
      imobiliaria: job.imobiliaria,
      accountId: job.account_id,
    });
    const report = await metaGraph<Record<string, unknown>>(
      `/${externalId(data.reportRunId)}`,
      token,
      {
        fields:
          "id,account_id,level,time_range,time_increment,filtering,breakdowns,use_unified_attribution_setting,action_report_time",
      },
      {},
      { operation: "report", scopeKey: job.connection_id },
    );
    if (report.id !== data.reportRunId || !reportMatchesInsightScope(report, job))
      throw new Error(
        "A Meta não comprovou que este relatório pertence à conta, período e filtros desta coleta.",
      );
    const account = await getMetaAccount(job.account_id, token);
    if (account.account_id !== job.account_id) throw new Error("Conta incompatível.");
    const { error: saveError } = await db.rpc("meta_insight_reconcile", {
      p_id: job.id,
      p_actor: context.userId,
      p_report_id: data.reportRunId,
      p_currency: account.currency,
      p_timezone: account.timezone_name,
    });
    if (saveError) throw new Error("Não foi possível confirmar a reconciliação.");
    return { ok: true as const };
  });
