import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  campaigns: vi.fn(),
  insights: vi.fn(),
  reports: vi.fn(),
  leads: vi.fn(),
  vault: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/ads/sync.server", () => ({ runAdsSyncWorker: mocks.campaigns }));
vi.mock("@/lib/ads/entity-insights.server", () => ({ runMetaInsightJobs: mocks.insights }));
vi.mock("@/lib/marketing/report-jobs.server", () => ({ runMarketingReportJobs: mocks.reports }));
vi.mock("@/lib/ads/leadgen.server", () => ({ runMetaLeadWorker: mocks.leads }));
vi.mock("@/lib/workers/internal-token.server", () => ({ internalTokenAuthorized: mocks.vault }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { Route as ads } from "@/routes/api/public/hooks/ads-sync";
import { Route as leads } from "@/routes/api/public/hooks/meta-leads";
type WorkerRoute = {
  server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
};
const call = (route: unknown, token: string) =>
  (route as WorkerRoute).server.handlers.POST({
    request: new Request("https://example.invalid/hook", {
      method: "POST",
      headers: { apikey: token },
    }),
  });
beforeEach(() => {
  vi.stubEnv("WORKER_HOOK_SECRET", "synthetic-ads-worker");
  vi.stubEnv("PROPERTY_SYNC_WORKER_SECRET", "");
  vi.stubEnv("SUPABASE_ANON_KEY", "synthetic-public");
  mocks.campaigns.mockResolvedValue({ processed: 1 });
  mocks.insights.mockResolvedValue({ processed: 2, failed: 0 });
  mocks.reports.mockResolvedValue({ processed: 1, ready: 1, deferred: 0 });
  mocks.leads.mockResolvedValue({ processed: 1 });
  mocks.vault.mockImplementation((_db, token) => token === "synthetic-vault-worker");
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("worker dispatch authentication remains domain-specific", () => {
  it("ads hook rejects public/vault credentials before dispatch and accepts its existing worker apikey", async () => {
    for (const token of ["", "synthetic-public", "synthetic-vault-worker"])
      expect((await call(ads, token)).status).toBe(401);
    expect(mocks.campaigns).not.toHaveBeenCalled();
    expect(mocks.insights).not.toHaveBeenCalled();
    expect(mocks.reports).not.toHaveBeenCalled();
    expect(await (await call(ads, "synthetic-ads-worker")).json()).toEqual({
      processed: 1,
      insights: { processed: 2, failed: 0 },
      reports: { processed: 1, ready: 1, deferred: 0 },
    });
    expect(mocks.insights).toHaveBeenCalledWith(2);
    expect(mocks.reports).toHaveBeenCalledWith(1);
  });
  it("lead hook still accepts the vault mechanism independently", async () => {
    expect((await call(leads, "synthetic-vault-worker")).status).toBe(200);
    expect(mocks.leads).toHaveBeenCalledOnce();
    expect((await call(leads, "synthetic-public")).status).toBe(401);
  });
  it("a new report subsystem failure preserves successful existing sync", async () => {
    mocks.insights.mockRejectedValueOnce(new Error("synthetic failure"));
    const response = await call(ads, "synthetic-ads-worker");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 1,
      insights: { processed: 0, failed: 1 },
      reports: { processed: 1, ready: 1, deferred: 0 },
    });
  });
  it("PDF queue failure does not fail the successful campaign and insight dispatch", async () => {
    mocks.reports.mockRejectedValueOnce(new Error("synthetic failure"));
    const response = await call(ads, "synthetic-ads-worker");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 1,
      insights: { processed: 2, failed: 0 },
      reports: { processed: 0, failed: 1 },
    });
  });
});
