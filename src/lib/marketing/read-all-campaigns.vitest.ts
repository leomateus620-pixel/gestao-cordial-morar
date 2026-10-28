import { describe, expect, it } from "vitest";
import type { CampaignPage, MarketingQuery } from "./marketing.functions";
import { marketingCampaignDto } from "./marketing.dto";
import { readAllCampaigns } from "./read-all-campaigns";

function fixture(total: number) {
  const items = Array.from({ length: total }, (_, i) => marketingCampaignDto({
    id: `campaign-${i}`, imobiliaria: "cordial", nome: `Campaign ${i}`,
    canal: "Facebook", objetivo: "Leads qualificados", status: "Ativa",
    data_inicio: "2026-10-01", data_fim: "2026-10-31", investimento: 10,
    daily_metrics: [{ data: "2026-10-01", leads: 2, clicks: 3, investimento: 10 }],
  }, true));
  const calls: MarketingQuery[] = [];
  const read = async (q: MarketingQuery): Promise<CampaignPage> => {
    calls.push(q);
    const size = q.pageSize ?? 25;
    const offset = ((q.page ?? 1) - 1) * size;
    return { items: items.slice(offset, offset + size), total, financialVisible: true, page: q.page ?? 1, pageSize: size };
  };
  return { read, calls };
}

describe("complete marketing report campaigns", () => {
  it("includes all 57 campaigns rather than just the newest 25 in report totals", async () => {
    const { read } = fixture(57);
    const result = await readAllCampaigns(read, {});
    expect(result.items).toHaveLength(57);
    expect(result.items.reduce((n, c) => n + c.leads, 0)).toBe(114);
    expect(result.items.reduce((n, c) => n + c.clicks, 0)).toBe(171);
    expect(result.items.reduce((n, c) => n + (c.investment ?? 0), 0)).toBe(570);
  });
  it("reads beyond both the RPC's 100 and Data API's 1000 row limits with the same scope", async () => {
    const { read, calls } = fixture(1250);
    const scope: MarketingQuery = { imobiliaria: "morar", accountId: "123", since: "2026-10-01", until: "2026-10-28" };
    const result = await readAllCampaigns(read, scope);
    expect(result.items).toHaveLength(1250);
    expect(calls).toHaveLength(13);
    expect(calls[12]).toEqual({ ...scope, page: 13, pageSize: 100 });
  });
  it("does not return partial totals when a later request fails", async () => {
    const { read } = fixture(125);
    await expect(readAllCampaigns(async (q) => {
      if (q.page === 2) throw new Error("read failed");
      return read(q);
    }, {})).rejects.toThrow("read failed");
  });
  it.each(["empty", "duplicate", "changed-total", "changed-access"])("rejects incomplete or inconsistent pages: %s", async (mode) => {
    const { read } = fixture(125);
    await expect(readAllCampaigns(async (q) => {
      const page = await read(q);
      if (q.page === 2) {
        if (mode === "empty") page.items = [];
        if (mode === "duplicate") page.items = (await read({ ...q, page: 1 })).items;
        if (mode === "changed-total") page.total = 126;
        if (mode === "changed-access") page.financialVisible = false;
      }
      return page;
    }, {})).rejects.toThrow("todas as campanhas");
  });
  it("returns an empty complete report without additional reads", async () => {
    const { read, calls } = fixture(0);
    expect((await readAllCampaigns(read, {})).items).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});