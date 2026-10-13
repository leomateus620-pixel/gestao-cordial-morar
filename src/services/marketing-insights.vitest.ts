import { describe, expect, it } from "vitest";
import type { MarketingCampaign } from "@/types/marketing";
import { buildInsights, campaignStats, competenceRange, delta, periodKpis, shiftCompetence } from "./marketing-insights";

const base = (o: Partial<MarketingCampaign>): MarketingCampaign =>
  ({
    id: "1", name: "A", channel: "Facebook", objective: "Visitas", status: "Ativa",
    startDate: "2026-09-01", endDate: "2026-10-31", investment: 0, leads: 0, clicks: 0, accesses: 0, views: 0,
    impressions: 0, conversionRate: 0, costPerLead: 0, bestLocation: "", responsiblePerson: "", notes: "", diagnosis: "",
    dailyMetrics: [], locationBreakdown: [], createdAt: "", updatedAt: "", imobiliaria: "cordial", ...o,
  }) as MarketingCampaign;

describe("marketing insights", () => {
  it("competence helpers", () => {
    expect(shiftCompetence("2026-01", -1)).toBe("2025-12");
    expect(competenceRange("2026-02").until).toBe("2026-02-28");
    expect(delta(110, 100)).toBe(10);
    expect(delta(5, 0)).toBeNull();
  });
  it("aggregates synced daily metrics in the month", () => {
    const c = base({
      dailyMetrics: [
        { date: "2026-10-01", leads: 2, clicks: 10, views: 0, accesses: 10, impressions: 1000, reach: 400, spend: 50 },
        { date: "2026-10-02", leads: 0, clicks: 10, views: 0, accesses: 10, impressions: 1000, reach: 200, spend: 50 },
        { date: "2026-09-30", leads: 9, clicks: 1, views: 0, accesses: 1, impressions: 1, reach: 1, spend: 999 },
      ],
    });
    const s = campaignStats(c, "2026-10");
    expect(s.spend).toBe(100);
    expect(s.cpl).toBe(50);
    expect(s.ctr).toBe(1);
    expect(periodKpis([s]).cpm).toBe(50);
  });
  it("manual campaign counts investment when it overlaps", () => {
    expect(campaignStats(base({ investment: 300 }), "2026-10").spend).toBe(300);
    expect(campaignStats(base({ investment: 300 }), "2026-12").spend).toBe(0);
  });
  it("flags spend without leads", () => {
    const s = campaignStats(base({ dailyMetrics: [{ date: "2026-10-05", leads: 0, clicks: 3, views: 0, accesses: 3, spend: 80, impressions: 100, reach: 20 }] }), "2026-10");
    const ins = buildInsights([s], []);
    expect(ins.some((i) => i.tone === "danger")).toBe(true);
    expect(ins.some((i) => i.text.includes("Frequência"))).toBe(true);
  });
});
