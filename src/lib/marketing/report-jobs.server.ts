import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingReportDocument } from "./report-document";

export const INLINE_REPORT_ROWS = 250;
export type MarketingReportJob = {
  id: string;
  author_id: string;
  imobiliaria: "cordial" | "morar";
  snapshot: MarketingReportDocument;
  snapshot_hash: string;
  row_count: number;
  financial: boolean;
  version: number;
  worker_id: string;
  fence: number;
};
/** jsonb may reorder keys; array order remains part of the immutable snapshot. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function reportSnapshotHash(model: MarketingReportDocument): string {
  return createHash("sha256")
    .update(canonical(JSON.parse(JSON.stringify(model))))
    .digest("hex");
}
export function reportJobPath(job: MarketingReportJob) {
  return `${job.imobiliaria}/${job.author_id}/${job.id}/v${job.version}-${job.snapshot_hash.slice(0, 16)}-f${job.fence}.pdf`;
}
type Renderer = (model: MarketingReportDocument) => Promise<Uint8Array>;
const render: Renderer = async (model) => {
  const { renderMarketingReport } = await import("./report-pdf.server");
  return renderMarketingReport(model);
};

/** One bounded attempt. A stale worker can neither overwrite a file nor commit another lease. */
export async function processMarketingReportJob(
  db: SupabaseClient,
  job: MarketingReportJob,
  renderer: Renderer = render,
): Promise<"ready" | "deferred"> {
  const lease = { p_id: job.id, p_worker: job.worker_id, p_fence: job.fence };
  let errorCode = "snapshot_invalid";
  let retryable = false;
  try {
    const model = job.snapshot;
    if (
      !model ||
      model.version !== job.version ||
      model.scope.imobiliaria !== job.imobiliaria ||
      model.financialVisible !== job.financial ||
      !Array.isArray(model.rows) ||
      model.rows.length !== job.row_count ||
      model.total !== job.row_count ||
      model.total > 5000 ||
      reportSnapshotHash(model) !== job.snapshot_hash
    )
      throw new Error("snapshot_invalid");
    const first = await db.rpc("marketing_report_check_lease", lease);
    if (first.error || first.data !== true) return "deferred";
    errorCode = "generation_failed";
    const pdf = await renderer(model);
    if (pdf.byteLength > 10 * 1024 * 1024) {
      errorCode = "file_limit";
      throw new Error("file_limit");
    }
    const current = await db.rpc("marketing_report_check_lease", lease);
    if (current.error || current.data !== true) return "deferred";
    const path = reportJobPath(job);
    errorCode = "storage_failed";
    retryable = true;
    const uploaded = await db.storage
      .from("marketing-reports")
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (uploaded.error) throw new Error("storage_failed");
    errorCode = "commit_failed";
    const committed = await db.rpc("marketing_report_commit", { ...lease, p_path: path });
    if (committed.error) throw new Error("commit_failed");
    // A private uploaded orphan is never exposed through history and never deleted
    // after an ambiguous commit; the DB may already have committed a valid ready file.
    return committed.data === true ? "ready" : "deferred";
  } catch {
    await db.rpc("marketing_report_fail", { ...lease, p_error: errorCode, p_retryable: retryable });
    return "deferred";
  }
}

export async function runMarketingReportJobs(limit = 1) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as SupabaseClient;
  const worker = randomUUID();
  let processed = 0,
    ready = 0;
  for (let n = 0; n < Math.max(1, Math.min(2, limit)); n++) {
    const { data, error } = await db.rpc("marketing_report_claim", { p_worker: worker });
    if (error) throw new Error("report_queue_unavailable");
    const job = (data as MarketingReportJob[] | null)?.[0];
    if (!job) break;
    processed++;
    if ((await processMarketingReportJob(db, job)) === "ready") ready++;
  }
  return { processed, ready, deferred: processed - ready };
}
