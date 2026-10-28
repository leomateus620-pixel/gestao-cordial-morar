import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("./credentials.server", () => ({
  resolveConnectionCredential: async () => ({ token: "test-token" }),
}));
import {
  processMetaInsightJob,
  reportMatchesInsightScope,
  type InsightJob,
} from "./entity-insights.server";
import { resetMetaGraphTransportState } from "./meta.graph.server";
const job: InsightJob = {
  id: "job",
  requested_by: "actor",
  connection_id: "connection",
  account_id: "1",
  imobiliaria: "cordial",
  campaign_id: "local-id",
  external_campaign_id: "2",
  level: "ad",
  grain: "period",
  breakdown: "none",
  since: "2026-10-01",
  until: "2026-10-28",
  status: "submitting",
  report_run_id: null,
  after_cursor: null,
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  attempts: 1,
  api_version: "v26.0",
};
const db = () => ({
  rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    error: null,
    data: true,
  })),
});
const account = {
  account_id: "1",
  name: "Synthetic test account",
  currency: "BRL",
  timezone_name: "America/Sao_Paulo",
};
afterEach(() => {
  vi.unstubAllGlobals();
  resetMetaGraphTransportState();
});
describe("async Insights worker — synthetic provider responses", () => {
  it("checks the requesting actor again before resolving credentials or calling Meta", async () => {
    const store = db();
    store.rpc.mockResolvedValueOnce({ error: null, data: false });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await processMetaInsightJob(store as unknown as SupabaseClient, job, "worker");
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.rpc).toHaveBeenLastCalledWith(
      "meta_insight_checkpoint",
      expect.objectContaining({ p_status: "failed", p_error: "no_permission" }),
    );
  });
  it("persists returned report ID before any polling/result read", async () => {
    const store = db();
    const fn = vi
      .fn<(input: unknown, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify(account)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report_run_id: "10" })));
    vi.stubGlobal("fetch", fn);
    await processMetaInsightJob(store as unknown as SupabaseClient, job, "worker");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1][1].method).toBe("POST");
    expect(store.rpc).toHaveBeenCalledWith(
      "meta_insight_checkpoint",
      expect.objectContaining({ p_status: "polling", p_report_id: "10", p_currency: "BRL" }),
    );
  });
  it("timeout after POST becomes uncertain, without a repeated POST", async () => {
    const store = db();
    const fn = vi
      .fn<(input: unknown, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify(account)))
      .mockRejectedValueOnce(new Error("secret"));
    vi.stubGlobal("fetch", fn);
    await processMetaInsightJob(store as unknown as SupabaseClient, job, "worker");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(store.rpc).toHaveBeenCalledWith(
      "meta_insight_checkpoint",
      expect.objectContaining({ p_status: "uncertain", p_error: "outcome_uncertain" }),
    );
  });
  it("failed persistence after confirmed report ID still cannot resubmit", async () => {
    const store = db();
    store.rpc
      .mockResolvedValueOnce({ error: null, data: true })
      .mockResolvedValueOnce({ error: { message: "database interrupted" }, data: null } as never);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<(input: unknown, init: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response(JSON.stringify(account)))
        .mockResolvedValueOnce(new Response(JSON.stringify({ report_run_id: "10" }))),
    );
    await processMetaInsightJob(store as unknown as SupabaseClient, job, "worker");
    expect(store.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_status: "uncertain" });
  });
  it("percentage 100 with running status only schedules another poll", async () => {
    const store = db();
    vi.stubGlobal(
      "fetch",
      vi.fn<(input: unknown, init: RequestInit) => Promise<Response>>().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "10",
            account_id: "1",
            async_status: "Job Running",
            async_percent_completion: 100,
          }),
        ),
      ),
    );
    await processMetaInsightJob(
      store as unknown as SupabaseClient,
      { ...job, status: "polling", report_run_id: "10" },
      "worker",
    );
    expect(store.rpc).toHaveBeenCalledWith(
      "meta_insight_checkpoint",
      expect.objectContaining({ p_status: "polling" }),
    );
  });
  it("missing/cross-scope page never commits metrics or erases prior snapshot", async () => {
    const store = db();
    vi.stubGlobal(
      "fetch",
      vi.fn<(input: unknown, init: RequestInit) => Promise<Response>>().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ account_id: "9", campaign_id: "2", account_currency: "BRL" }],
          }),
        ),
      ),
    );
    await processMetaInsightJob(
      store as unknown as SupabaseClient,
      { ...job, status: "collecting", report_run_id: "10" },
      "worker",
    );
    expect(store.rpc).toHaveBeenCalledTimes(2);
    expect(store.rpc).toHaveBeenCalledWith(
      "meta_insight_checkpoint",
      expect.objectContaining({ p_status: "failed", p_error: "partial_data" }),
    );
  });
  it("only reconciles a report with every scope setting positively proven", () => {
    const report = {
      account_id: "1",
      level: "ad",
      time_range: { since: job.since, until: job.until },
      time_increment: "all_days",
      use_unified_attribution_setting: true,
      action_report_time: "impression",
      breakdowns: [],
      filtering: [{ field: "campaign.id", operator: "IN", value: ["2"] }],
    };
    expect(reportMatchesInsightScope(report, job)).toBe(true);
    expect(reportMatchesInsightScope({ ...report, filtering: [] }, job)).toBe(false);
    expect(reportMatchesInsightScope({ ...report, account_id: "9" }, job)).toBe(false);
    expect(reportMatchesInsightScope({ ...report, time_range: undefined }, job)).toBe(false);
  });
});
