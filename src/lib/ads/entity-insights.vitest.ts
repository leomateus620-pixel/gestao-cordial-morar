import { describe, expect, it } from "vitest";
import {
  entityInsightTotals,
  normalizeEntityInsight,
  sumInsightDecimals,
} from "./entity-insights.model";
import {
  classifyInsightReport,
  insightReportParameters,
  type InsightJob,
} from "./entity-insights.server";
const scope = {
  accountId: "1",
  campaignId: "2",
  level: "ad" as const,
  grain: "period" as const,
  breakdown: "none" as const,
  since: "2026-10-01",
  until: "2026-10-28",
  currency: "BRL",
};
const raw = {
  account_id: "1",
  account_currency: "BRL",
  campaign_id: "2",
  adset_id: "3",
  ad_id: "4",
  date_start: scope.since,
  date_stop: scope.until,
  impressions: "100",
  clicks: "10",
  inline_link_clicks: "3",
  spend: "12.34",
  reach: "60",
  frequency: "1.666667",
  actions: [
    { action_type: "lead", value: "80" },
    { action_type: "onsite_conversion.lead_grouped", value: "2" },
  ],
};
describe("typed hierarchy metrics", () => {
  it("keeps IDs/decimals and chooses one lead family", () => {
    expect(normalizeEntityInsight(raw, scope)).toMatchObject({
      entityId: "4",
      spend: "12.34",
      clicks: "10",
      inlineLinkClicks: "3",
      leads: "2",
      leadActionType: "onsite_conversion.lead_grouped",
      attribution: null,
    });
  });
  it("preserves zero and distinguishes absent/suppressed values", () => {
    const row = normalizeEntityInsight(
      { ...raw, spend: "0", impressions: undefined, actions: [] },
      scope,
    );
    expect(row.spend).toBe("0");
    expect(row.impressions).toBeNull();
    expect(row.leads).toBeNull();
    expect(entityInsightTotals([row], "BRL").ctr).toBeNull();
  });
  it.each([
    { account_id: "9" },
    { campaign_id: "9" },
    { account_currency: "USD" },
    { date_stop: "2026-10-27" },
    { spend: "NaN" },
    { impressions: "-1" },
    { ad_id: 4 },
  ])("rejects incomplete/cross-scope provider row %j", (change) =>
    expect(() => normalizeEntityInsight({ ...raw, ...change }, scope)).toThrow(),
  );
  it("daily reach/frequency never become additive pseudo-unique people", () => {
    const row = normalizeEntityInsight(
      { ...raw, date_stop: raw.date_start },
      { ...scope, grain: "daily" },
    );
    expect(row.reach).toBeNull();
    expect(row.frequency).toBeNull();
  });
  it("requires normalized supported breakdown data", () => {
    expect(() =>
      normalizeEntityInsight(raw, { ...scope, breakdown: "publisher_platform" }),
    ).toThrow();
    expect(
      normalizeEntityInsight(
        { ...raw, publisher_platform: "instagram" },
        { ...scope, breakdown: "publisher_platform" },
      ).breakdown,
    ).toEqual({ publisher_platform: "instagram" });
  });
  it("derives weighted rates from compatible denominators; does not add reach", () => {
    const a = normalizeEntityInsight(raw, scope),
      b = normalizeEntityInsight(
        { ...raw, ad_id: "5", impressions: "900", clicks: "9", spend: "87.66" },
        scope,
      );
    expect(entityInsightTotals([a, b], "BRL")).toMatchObject({
      spend: "100",
      impressions: "1000",
      clicks: "19",
      ctr: 1.9,
      cpm: 100,
      reach: null,
      frequency: null,
    });
  });
  it("retains decimal precision and avoids arbitrary currency decimal assumptions", () => {
    expect(sumInsightDecimals(["99999999999999999999.00001", "0.00002"])).toBe(
      "99999999999999999999.00003",
    );
    expect(sumInsightDecimals(["1", null])).toBeNull();
    expect(entityInsightTotals([normalizeEntityInsight(raw, scope)], null).spend).toBeNull();
  });
  it("does not merge incompatible lead families", () => {
    const a = normalizeEntityInsight(raw, scope),
      b = normalizeEntityInsight(
        {
          ...raw,
          ad_id: "5",
          actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "5" }],
        },
        scope,
      );
    expect(entityInsightTotals([a, b], "BRL").leads).toBeNull();
  });
});
describe("asynchronous insight contract", () => {
  it("POST parameters are report-only, campaign scoped and explicitly grained", () => {
    const p = insightReportParameters({
      level: "adset",
      grain: "daily",
      breakdown: "none",
      since: scope.since,
      until: scope.until,
      external_campaign_id: "2",
    } as InsightJob);
    expect(p.time_increment).toBe("1");
    expect(JSON.parse(p.filtering)).toEqual([
      { field: "campaign.id", operator: "IN", value: ["2"] },
    ]);
    expect(p).not.toHaveProperty("status");
    expect(p).not.toHaveProperty("budget");
    expect(p.fields.split(",")).not.toContain("ad_id");
  });
  it("requires completion status, not only percent 100", () => {
    expect(classifyInsightReport("Job Running")).toBe("polling");
    expect(classifyInsightReport("Job Completed")).toBe("collecting");
    expect(classifyInsightReport("Job Failed")).toBe("failed");
    expect(classifyInsightReport("Job Expired")).toBe("expired");
    expect(() => classifyInsightReport("invented")).toThrow();
  });
});
