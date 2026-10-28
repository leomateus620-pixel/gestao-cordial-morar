import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdsContext } from "@/lib/ads/authorization.server";
import { buildMarketingReport } from "./report-model";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), render: vi.fn(), permit: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/ads/authorization.server", () => ({ requireMarketingAction: mocks.permit }));
vi.mock("./report-pdf.server", () => ({ renderMarketingReport: mocks.render }));
import { persistMarketingReport } from "./report-storage.server";
const context = { userId: "synthetic-author" } as AdsContext;
function model(total: number) {
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
  snapshot.rows = Array.from({ length: total }, (_, i) => ({
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
  snapshot.total = total;
  return snapshot;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permit.mockResolvedValue({});
  mocks.rpc.mockResolvedValue({ data: "synthetic-id", error: null });
});
describe("report request durability", () => {
  it("more than250 rows is acknowledged only after durable enqueue and never rendered inline", async () => {
    const document = model(251);
    const response = await persistMarketingReport(context, document);
    expect(response.status).toBe("queued");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "marketing_report_enqueue",
      expect.objectContaining({ p_actor: context.userId, p_snapshot: document }),
    );
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("never acknowledges a job if queue persistence fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "synthetic error" } });
    await expect(persistMarketingReport(context, model(251))).rejects.toThrow("registrar");
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("rechecks financial permission before persisting a financial snapshot", async () => {
    const document = { ...model(251), financialVisible: true };
    mocks.permit.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Denied"));
    await expect(persistMarketingReport(context, document)).rejects.toThrow("Denied");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
