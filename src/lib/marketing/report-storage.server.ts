import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdsContext } from "@/lib/ads/authorization.server";
import type { MarketingReportDocument } from "./report-document";
import {
  INLINE_REPORT_ROWS,
  processMarketingReportJob,
  reportSnapshotHash,
  type MarketingReportJob,
} from "./report-jobs.server";

/** Small and large reports share durable intent, immutable snapshot and private file ownership. */
export async function persistMarketingReport(context: AdsContext, model: MarketingReportDocument) {
  const { requireMarketingAction } = await import("@/lib/ads/authorization.server");
  await requireMarketingAction(context, "generate_report", model.scope.imobiliaria);
  if (model.financialVisible)
    await requireMarketingAction(context, "financial_report", model.scope.imobiliaria);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as SupabaseClient;
  const id = randomUUID();
  const { error } = await db.rpc("marketing_report_enqueue", {
    p_id: id,
    p_actor: context.userId,
    p_snapshot: model,
    p_hash: reportSnapshotHash(model),
  });
  if (error) throw new Error("Não foi possível registrar a geração.");
  // Durable before rendering: losing the request/runtime leaves a claimable job.
  if (model.total <= INLINE_REPORT_ROWS) {
    const { data, error: claimError } = await db.rpc("marketing_report_claim", {
      p_worker: randomUUID(),
      p_id: id,
    });
    const job = (data as MarketingReportJob[] | null)?.[0];
    if (!claimError && job && (await processMarketingReportJob(db, job)) === "ready")
      return { id, status: "ready" as const };
    // A commit response may be lost after SQL succeeded. Consult persisted state;
    // never announce a failed attempt as queued or delete a potentially ready file.
    const { data: saved } = await db
      .from("marketing_reports")
      .select("status")
      .eq("id", id)
      .eq("author_id", context.userId)
      .maybeSingle();
    if (saved?.status === "ready") return { id, status: "ready" as const };
    if (saved?.status === "failed")
      throw new Error("Geração não concluída. Consulte a tentativa no histórico privado.");
  }
  return { id, status: "queued" as const };
}
