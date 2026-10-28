import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildMarketingReport,
  reportScopeSchema,
  type MarketingReportScope,
  type ReportSource,
} from "./report-model";
import type { AdsContext } from "@/lib/ads/authorization.server";

async function permit(context: AdsContext, agency: string) {
  const { requireMarketingAction } = await import("@/lib/ads/authorization.server");
  await requireMarketingAction(context, "generate_report", agency);
}
async function snapshot(context: AdsContext, data: MarketingReportScope) {
  await permit(context, data.imobiliaria);
  const { data: raw, error } = await context.supabase.rpc("marketing_report_snapshot", {
    p_agency: data.imobiliaria,
    p_since: data.filters.since,
    p_until: data.filters.until,
    p_account: data.filters.accountId?.replace(/^act_/, "") ?? null,
    p_platform: data.filters.platform ?? null,
    p_status: data.filters.status ?? null,
    p_search: data.filters.search || null,
  });
  if (error)
    throw new Error(
      "Não foi possível preparar o relatório. Limite: 5.000 campanhas e 367 dias; reduza o escopo ou confira as migrações.",
    );
  return buildMarketingReport(data, raw as ReportSource);
}
export const previewMarketingReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: MarketingReportScope) => reportScopeSchema.parse(value))
  .handler(({ context, data }) => snapshot(context, data));

export const generateMarketingReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: MarketingReportScope) => reportScopeSchema.parse(value))
  .handler(async ({ context, data }) => {
    const model = await snapshot(context, data);
    const { persistMarketingReport } = await import("./report-storage.server");
    return persistMarketingReport(context, model);
  });
export type MarketingReportRecord = {
  id: string;
  kind: "executive" | "detailed" | "funnel";
  status: "generating" | "queued" | "processing" | "ready" | "failed";
  scope: MarketingReportScope;
  row_count: number;
  created_at: string;
  completed_at: string | null;
  financial: boolean;
};
export const listMarketingReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { imobiliaria: "cordial" | "morar" }) =>
    z.object({ imobiliaria: z.enum(["cordial", "morar"]) }).parse(value),
  )
  .handler(async ({ context, data }): Promise<MarketingReportRecord[]> => {
    await permit(context, data.imobiliaria);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as SupabaseClient)
      .from("marketing_reports")
      .select("id,kind,status,scope,row_count,created_at,completed_at,financial")
      .eq("imobiliaria", data.imobiliaria)
      .eq("author_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Histórico indisponível.");
    const { data: financial } = await context.supabase.rpc("marketing_can_act", {
      p_action: "financial_report",
      p_agency: data.imobiliaria,
    });
    return (rows ?? []).filter(
      (r) => !r.financial || financial === true,
    ) as MarketingReportRecord[];
  });
export const downloadMarketingReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    const { requireMarketingAction } = await import("@/lib/ads/authorization.server");
    await requireMarketingAction(context, "generate_report");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as SupabaseClient;
    const { data: row, error } = await db
      .from("marketing_reports")
      .select("imobiliaria,author_id,financial,storage_path,status")
      .eq("id", data.id)
      .eq("author_id", context.userId)
      .maybeSingle();
    if (error || !row || row.status !== "ready" || !row.storage_path)
      throw new Error("Relatório indisponível.");
    await permit(context, row.imobiliaria);
    if (row.financial) await requireMarketingAction(context, "financial_report", row.imobiliaria);
    if (!row.storage_path.startsWith(`${row.imobiliaria}/${context.userId}/${data.id}/`))
      throw new Error("Arquivo inválido.");
    const { data: signed, error: signError } = await db.storage
      .from("marketing-reports")
      .createSignedUrl(row.storage_path, 60, { download: `marketing-${data.id}.pdf` });
    if (signError || !signed?.signedUrl) throw new Error("Download indisponível.");
    return { url: signed.signedUrl, expiresIn: 60 };
  });
