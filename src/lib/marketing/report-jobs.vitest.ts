import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketingReport } from "./report-model";
import {
  processMarketingReportJob,
  reportJobPath,
  reportSnapshotHash,
  type MarketingReportJob,
} from "./report-jobs.server";
function job(): MarketingReportJob {
  const snapshot = buildMarketingReport(
    {
      imobiliaria: "cordial",
      type: "detailed",
      filters: { since: "2026-10-01", until: "2026-10-28" },
    },
    {
      items: [],
      total: 0,
      financial_visible: false,
      captured_at: "2026-10-28T12:00:00Z",
      funnel: { submissions: 0, attendances: 0, linkedSubmissions: 0 },
    },
  );
  snapshot.rows = Array.from({ length: 501 }, (_, i) => ({
    id: String(i),
    name: `SYNTHETIC ${i}`,
    platform: "meta",
    status: "Ativa" as const,
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    accountId: "123",
    spend: null,
    leads: 1,
    clicks: 2,
    impressions: 3,
    ctr: 2 / 3,
    cpl: null,
    reach: null,
    frequency: null,
    updatedAt: null,
    coverage: "data",
  }));
  snapshot.total = 501;
  return {
    id: "test-id",
    author_id: "test-author",
    imobiliaria: "cordial",
    snapshot,
    snapshot_hash: reportSnapshotHash(snapshot),
    row_count: 501,
    financial: false,
    version: 1,
    worker_id: "worker",
    fence: 1,
  };
}
function database() {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const db = {
    rpc,
    storage: { from: vi.fn().mockReturnValue({ upload }) },
  } as unknown as SupabaseClient;
  return { rpc, upload, db };
}
describe("durable PDF worker", () => {
  it("renders all snapshot rows and commits only the exact private fenced path", async () => {
    const j = job(),
      { db, rpc, upload } = database();
    const render = vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    expect(await processMarketingReportJob(db, j, render)).toBe("ready");
    expect(render.mock.calls[0][0].rows).toHaveLength(501);
    expect(upload).toHaveBeenCalledWith(reportJobPath(j), expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(rpc).toHaveBeenLastCalledWith("marketing_report_commit", {
      p_id: j.id,
      p_worker: j.worker_id,
      p_fence: 1,
      p_path: reportJobPath(j),
    });
  });
  it("rechecks permission and lease after rendering before uploading", async () => {
    const j = job(),
      { db, rpc, upload } = database();
    rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: false });
    expect(await processMarketingReportJob(db, j, async () => new Uint8Array([1]))).toBe(
      "deferred",
    );
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("marketing_report_commit", expect.anything());
  });
  it("refuses truncated or modified snapshots and never logs their contents", async () => {
    const j = job(),
      { db, rpc, upload } = database();
    j.snapshot.rows.pop();
    const render = vi.fn();
    expect(await processMarketingReportJob(db, j, render)).toBe("deferred");
    expect(render).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("marketing_report_fail", {
      p_id: j.id,
      p_worker: j.worker_id,
      p_fence: j.fence,
      p_error: "snapshot_invalid",
      p_retryable: false,
    });
  });
  it("snapshot hash survives jsonb key reorder, but preserves row order and fence changes filename", () => {
    const j = job();
    const reordered = Object.fromEntries(Object.entries(j.snapshot).reverse()) as typeof j.snapshot;
    expect(reportSnapshotHash(reordered)).toBe(j.snapshot_hash);
    expect(reportSnapshotHash({ ...j.snapshot, rows: [...j.snapshot.rows].reverse() })).not.toBe(
      j.snapshot_hash,
    );
    expect(reportJobPath({ ...j, fence: 2 })).not.toBe(reportJobPath(j));
  });
  it("ambiguous commit remains recoverable without deleting a potentially committed file", async () => {
    const j = job(),
      { db, rpc, upload } = database();
    rpc
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ error: { message: "synthetic private provider error" } });
    expect(await processMarketingReportJob(db, j, async () => new Uint8Array([1]))).toBe(
      "deferred",
    );
    expect(upload).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenLastCalledWith("marketing_report_fail", {
      p_id: j.id,
      p_worker: j.worker_id,
      p_fence: 1,
      p_error: "commit_failed",
      p_retryable: true,
    });
  });
});
