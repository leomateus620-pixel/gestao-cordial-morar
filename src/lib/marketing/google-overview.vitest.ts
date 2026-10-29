import { describe, expect, it } from "vitest";
import { googleOverviewDto, googleOverviewQuerySchema } from "./google-overview.functions";

const query = googleOverviewQuerySchema.parse({
  since: "2026-10-01",
  until: "2026-10-28",
  agency: "cordial",
});
const values = {
  cost: "1.234567",
  impressions: "99",
  clicks: "5",
  conversions: "2.75",
  ctr: "5.050505",
  cpc: "0.2469134",
  costPerConversion: "0.448933",
};
const empty = {
  cost: null,
  impressions: null,
  clicks: null,
  conversions: null,
  ctr: null,
  cpc: null,
  costPerConversion: null,
};
const record = () => ({
  coverage: "partial",
  accounts: [{ id: "1234567890", name: "Conta direta", agency: "cordial" }],
  accountName: "Conta direta",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  lastCollectedAt: "2026-10-29T01:00:00Z",
  summary: values,
  series: [{ date: "2026-10-01", metrics: values }],
  total: 1,
  items: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Campanha",
      status: "Ativa",
      nativeStatus: null,
      channelType: null,
      channelSubtype: null,
      accountId: "1234567890",
      agency: "cordial",
      accountName: "Conta direta",
      dataInicio: "2026-10-01",
      dataFim: "2026-10-31",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      lastCollectedAt: "2026-10-29T01:00:00Z",
      coverage: "partial",
      metrics: values,
      dailySeries: [{ date: "2026-10-01", metrics: values }],
    },
  ],
});
describe("Google overview contract", () => {
  it("preserves exact decimals, scoping and observed coverage", () => {
    const result = googleOverviewDto(record(), query, true);
    expect(result.summary).toEqual(values);
    expect(result.items[0].metrics.conversions).toBe("2.75");
    expect(result.coverage).toBe("partial");
    expect(result.scope.agency).toBe("cordial");
  });
  it("masks financial metrics across summary, series and rows", () => {
    const result = googleOverviewDto(record(), query, false);
    expect(result.summary.cost).toBeNull();
    expect(result.summary.cpc).toBeNull();
    expect(result.items[0].metrics.costPerConversion).toBeNull();
    expect(result.series?.[0].metrics.cost).toBeNull();
    expect(result.items[0].dailySeries?.[0].metrics.cpc).toBeNull();
    expect(result.summary.conversions).toBe("2.75");
  });
  it("preserves unavailable results instead of manufacturing zeros", () => {
    const result = googleOverviewDto(
      {
        coverage: "unavailable",
        accounts: [],
        accountName: null,
        currency: null,
        timezone: null,
        lastCollectedAt: null,
        summary: empty,
        series: null,
        items: [],
        total: 0,
      },
      query,
      true,
    );
    expect(result.summary).toEqual(empty);
    expect(result.series).toBeNull();
  });
  it("rejects invented coverage, numerical precision loss and incomplete totals", () => {
    expect(() => googleOverviewDto({ ...record(), coverage: "complete" }, query, true)).toThrow();
    expect(() =>
      googleOverviewDto({ ...record(), summary: { ...values, cost: 1.23 } }, query, true),
    ).toThrow();
    expect(() =>
      googleOverviewDto({ ...record(), coverage: "unavailable" }, query, true),
    ).toThrow();
    expect(() => googleOverviewDto({ ...record(), total: 0 }, query, true)).toThrow();
  });
  it("rejects rows and dates outside the requested scope", () => {
    const data = record();
    expect(() =>
      googleOverviewDto({ ...data, items: [{ ...data.items[0], agency: "morar" }] }, query, true),
    ).toThrow();
    expect(() =>
      googleOverviewDto(
        { ...data, series: [{ date: "2026-09-30", metrics: values }] },
        query,
        true,
      ),
    ).toThrow();
  });
  it("rejects invalid dates, account IDs, periods and sort injection", () => {
    for (const input of [
      { since: "2026-02-30", until: "2026-03-01" },
      { since: "2025-01-01", until: "2026-12-31" },
      { since: "2026-10-01", until: "2026-10-28", accountId: "act_1234567890" },
      { since: "2026-10-01", until: "2026-10-28", sort: "name;drop" },
    ])
      expect(googleOverviewQuerySchema.safeParse(input).success).toBe(false);
  });
});
