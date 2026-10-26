import { describe, expect, it } from "vitest";
import type { MarketingCampaign } from "@/types/marketing";
import { normalizeMarketingCampaign } from "./marketing";
import {
  buildInsights,
  campaignStats,
  comparisonRanges,
  competenceRange,
  delta,
  periodKpis,
  shiftCompetence,
  summaryKpis,
} from "./marketing-insights";
const base = (o: Partial<MarketingCampaign> = {}): MarketingCampaign => ({
  id: "1",
  name: "A",
  channel: "Facebook",
  objective: "Visitas",
  status: "Ativa",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  investment: 0,
  leads: 0,
  clicks: 0,
  accesses: 0,
  views: 0,
  impressions: 0,
  conversionRate: 0,
  costPerLead: null,
  bestLocation: "",
  responsiblePerson: "",
  notes: "",
  diagnosis: "",
  dailyMetrics: [],
  locationBreakdown: [],
  createdAt: "",
  updatedAt: "",
  imobiliaria: "cordial",
  currency: "BRL",
  ...o,
});
const day = (overrides = {}) => ({
  date: "2026-10-01",
  leads: 2,
  clicks: 10,
  views: 0,
  accesses: 0,
  impressions: 1000,
  reach: 400,
  spend: 50,
  ...overrides,
});
describe("marketing period metrics", () => {
  it("compares current month through the same account-calendar day", () => {
    expect(shiftCompetence("2026-01", -1)).toBe("2025-12");
    expect(competenceRange("2026-02").until).toBe("2026-02-28");
    expect(comparisonRanges("2026-10", new Date("2026-10-26T12:00:00Z"))).toEqual({
      current: { since: "2026-10-01", until: "2026-10-26" },
      previous: { since: "2026-09-01", until: "2026-09-26" },
    });
    expect(comparisonRanges("2026-03", new Date("2026-03-31T12:00:00Z")).previous.until).toBe(
      "2026-02-28",
    );
  });
  it("uses weighted totals for CTR/CPC/CPM/CPL and never sums daily reach", () => {
    const s = campaignStats(
      base({
        dailyMetrics: [
          day(),
          day({ date: "2026-10-02", leads: 0, impressions: 100, clicks: 20, spend: 10, reach: 50 }),
        ],
      }),
      "2026-10",
    );
    expect(s.reach).toBeNull();
    expect(s.frequency).toBeNull();
    expect(s.cpl).toBe(30);
    const kpi = periodKpis([s]);
    expect(kpi.ctr).toBe(2.73);
    expect(kpi.cpc).toBe(2);
    expect(kpi.cpm).toBe(54.55);
  });
  it("accepts exact aggregate reach without adding overlapping campaigns", () => {
    const c = base({
      dailyMetrics: [day(), day({ date: "2026-10-02" })],
      periodAggregate: { since: "2026-10-01", until: "2026-10-31", reach: 450, frequency: 4.44 },
    });
    const stat = campaignStats(c, "2026-10");
    expect(stat.reach).toBe(450);
    expect(stat.frequency).toBe(4.44);
    expect(periodKpis([stat, { ...stat, campaign: base({ id: "2" }) }]).reach).toBeNull();
    expect(
      campaignStats(c, "2026-10", { since: "2026-10-01", until: "2026-10-26" }).reach,
    ).toBeNull();
  });
  it("keeps unavailable denominators distinct from measured zero", () => {
    const s = campaignStats(
      base({ dailyMetrics: [day({ leads: 0, clicks: 0, impressions: 0, spend: 10 })] }),
      "2026-10",
    );
    expect(s.cpl).toBeNull();
    expect(s.ctr).toBeNull();
    expect(periodKpis([s]).cpc).toBeNull();
    expect(campaignStats(base({ dailyMetrics: [day({ spend: 0 })] }), "2026-10").cpl).toBe(0);
    expect(delta(null, 10)).toBeNull();
    expect(delta(5, 0)).toBeNull();
  });
  it("does not call views impressions and does not fabricate timeline or location", () => {
    expect(
      campaignStats(
        base({
          dailyMetrics: [{ date: "2026-10-01", leads: 0, clicks: 5, accesses: 0, views: 1000 }],
        }),
        "2026-10",
      ).ctr,
    ).toBeNull();
    const c = normalizeMarketingCampaign(
      base({ leads: 12, clicks: 100, platform: "meta", externalCampaignId: "123" }),
    );
    expect(c.dailyMetrics).toEqual([]);
    expect(c.locationBreakdown).toEqual([]);
    expect(c.platform).toBe("meta");
    expect(c.externalCampaignId).toBe("123");
  });
  it("does not combine currencies or expose protected costs", () => {
    const a = campaignStats(base({ dailyMetrics: [day()], currency: "USD" }), "2026-10");
    const b = campaignStats(base({ dailyMetrics: [day()], currency: "BRL" }), "2026-10");
    expect(periodKpis([a, b]).spend).toBeNull();
    expect(periodKpis([a, b]).cpl).toBeNull();
    const hidden = campaignStats(
      base({
        financialVisible: false,
        investment: null,
        dailyMetrics: [day({ spend: undefined })],
      }),
      "2026-10",
    );
    expect(hidden.spend).toBeNull();
    expect(hidden.cpl).toBeNull();
  });
  it("only assigns manual total investment to a period containing the entire campaign", () => {
    expect(campaignStats(base({ investment: 300 }), "2026-10").spend).toBe(300);
    expect(
      campaignStats(base({ investment: 300, startDate: "2026-09-01" }), "2026-10").spend,
    ).toBeNull();
    expect(
      campaignStats(base({ investment: 300 }), "2026-10", {
        since: "2026-10-01",
        until: "2026-10-26",
      }).spend,
    ).toBeNull();
  });
  it("uses server full-filter summary independently of pagination and marks missing data", () => {
    const summary = summaryKpis({
      spend: 100,
      leads: 4,
      clicks: 25,
      impressions: 1000,
      active_campaigns: 50,
      currencies: ["BRL"],
      has_data: true,
    });
    expect(summary.activeCampaigns).toBe(50);
    expect(summary.cpl).toBe(25);
    expect(
      summaryKpis({
        spend: 0,
        leads: 0,
        clicks: 0,
        impressions: 0,
        active_campaigns: 2,
        currencies: [],
        has_data: false,
      }).spend,
    ).toBeNull();
  });
  it("reports evidence without diagnosing audience saturation from a universal threshold", () => {
    const stat = campaignStats(
      base({
        dailyMetrics: [day({ leads: 0 })],
        periodAggregate: { since: "2026-10-01", until: "2026-10-31", reach: 10, frequency: 100 },
      }),
      "2026-10",
    );
    const insights = buildInsights([stat], []);
    expect(insights.some((i) => i.financial && i.text.includes("nenhum lead"))).toBe(true);
    expect(insights.some((i) => i.text.includes("satur"))).toBe(false);
  });
});
