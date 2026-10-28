import { describe, expect, it } from "vitest";
import { changeMarketingQuery, marketingSearchSchema } from "../../src/lib/marketing/query-state";

const context = {
  agency: "morar",
  competence: "2026-10",
  since: "2026-10-10",
  until: "2026-10-16",
  accountId: "123456789",
  search: "Campanha de imóveis",
  status: "Ativa",
  page: 4,
  leadPage: 3,
  leadStatus: "review",
  leadSearch: "Contato",
  leadFormId: "987654321",
  leadCampaignId: "10000000-0000-4000-8000-000000000001",
  leadBrokerId: "70000000-0000-4000-8000-000000000001",
  sort: "name",
};

describe("Marketing restored Leads scope", () => {
  it.each(["google", "manual", ""])(
    "normalizes a direct %s URL before queries use it",
    (platform) => {
      const restored = marketingSearchSchema.parse({ ...context, area: "leads", platform });
      expect(restored).toEqual({
        ...context,
        area: "leads",
        platform: "meta",
        accountId: "",
        page: 1,
        leadPage: 1,
      });
    },
  );

  it("preserves a compatible Meta account and both independent pages on restoration", () => {
    const input = { ...context, area: "leads", platform: "meta" };
    const restored = marketingSearchSchema.parse(input);
    expect(restored).toEqual(input);
    expect(marketingSearchSchema.parse(restored)).toEqual(restored);
  });

  it("always sets Meta for Leads even when no platform was supplied", () => {
    const restored = marketingSearchSchema.parse({ ...context, area: "leads", platform: "" });
    expect(restored.platform).toBe("meta");
    expect(restored.accountId).toBe("");
    expect(restored.page).toBe(1);
    expect(restored.leadPage).toBe(1);
    expect(restored.agency).toBe("morar");
    expect(restored.leadFormId).toBe("987654321");
  });

  it.each(["google", "manual", ""])(
    "applies the same normalization when entering from %s through query state",
    (platform) => {
      const before = marketingSearchSchema.parse({ ...context, area: "campaigns", platform });
      const after = changeMarketingQuery(before, { area: "leads" });
      expect(after).toEqual({
        ...before,
        area: "leads",
        platform: "meta",
        accountId: "",
        page: 1,
        leadPage: 1,
      });
      expect(changeMarketingQuery(after, { area: "reports" })).toEqual({
        ...after,
        area: "reports",
      });
    },
  );

  it("preserves an explicitly Meta account when entering Leads from another area", () => {
    const before = marketingSearchSchema.parse({ ...context, area: "campaigns", platform: "meta" });
    expect(changeMarketingQuery(before, { area: "leads" })).toEqual({ ...before, area: "leads" });
  });

  it("keeps incompatible patches from reintroducing a misleading Leads scope", () => {
    const before = marketingSearchSchema.parse({ ...context, area: "leads", platform: "meta" });
    const after = changeMarketingQuery(before, { platform: "google", accountId: "222222222" });
    expect(after).toMatchObject({
      area: "leads",
      platform: "meta",
      accountId: "",
      page: 1,
      leadPage: 1,
    });
    expect(after.since).toBe(before.since);
    expect(after.until).toBe(before.until);
    expect(after.leadSearch).toBe("Contato");
  });

  it("does not normalize platforms or discard the account outside Leads", () => {
    for (const area of ["overview", "campaigns", "reports"])
      for (const platform of ["", "meta", "google", "manual"])
        expect(marketingSearchSchema.parse({ ...context, area, platform })).toEqual({
          ...context,
          area,
          platform,
        });
  });
});
