import { describe, expect, it } from "vitest";
import {
  compactMarketingRange,
  validateMarketingPeriod,
} from "../../src/lib/marketing/period-control";
import {
  changeMarketingQuery,
  marketingQueryRanges,
  marketingSearchSchema,
} from "../../src/lib/marketing/query-state";

describe("Marketing compact period and atomic applied scope", () => {
  it("keeps day, month and year clear across same-month, cross-month and cross-year intervals", () => {
    expect(compactMarketingRange({ since: "2026-10-01", until: "2026-10-28" })).toBe(
      "01–28 out. 2026",
    );
    expect(compactMarketingRange({ since: "2026-09-01", until: "2026-09-28" }, false)).toBe(
      "01–28 set.",
    );
    expect(compactMarketingRange({ since: "2026-10-28", until: "2026-10-28" })).toBe(
      "28 out. 2026",
    );
    expect(compactMarketingRange({ since: "2026-09-28", until: "2026-10-03" })).toBe(
      "28 set. – 03 out. 2026",
    );
    expect(compactMarketingRange({ since: "2025-12-28", until: "2026-01-03" }, false)).toBe(
      "28 dez. 2025 – 03 jan. 2026",
    );
  });

  it("rejects incomplete, malformed and non-existent calendar dates", () => {
    for (const [since, until] of [
      ["", "2026-10-28"],
      ["2026-10-01", ""],
      ["2026-02-29", "2026-03-01"],
      ["2026-02-31", "2026-03-01"],
      ["2026-13-01", "2026-13-02"],
      ["2026-1-01", "2026-01-02"],
      ["2026-10-01T00:00:00Z", "2026-10-28"],
    ])
      expect(validateMarketingPeriod(since, until)).toBe(
        "Selecione a data inicial e a data final.",
      );
    expect(validateMarketingPeriod("2028-02-29", "2028-03-01")).toBeNull();
  });

  it("validates order and the inclusive 367-day limit without treating calendar days as elapsed local hours", () => {
    expect(validateMarketingPeriod("2026-10-28", "2026-10-01")).toMatch(/posterior/);
    expect(validateMarketingPeriod("2026-10-28", "2026-10-28")).toBeNull();
    expect(validateMarketingPeriod("2026-01-01", "2027-01-02")).toBeNull();
    expect(validateMarketingPeriod("2026-01-01", "2027-01-03")).toMatch(/367 dias/);
    expect(validateMarketingPeriod("2026-03-07", "2026-03-10")).toBeNull();
  });

  it("applies both dates together and preserves business scope while resetting affected pages", () => {
    const before = marketingSearchSchema.parse({
      area: "leads",
      agency: "morar",
      accountId: "123",
      platform: "meta",
      page: 4,
      leadPage: 8,
      leadFormId: "456",
      leadSearch: "Contato",
      search: "Campanha",
    });
    const draft = { since: "2026-10-10", until: "2026-10-16" };
    expect(validateMarketingPeriod(draft.since, draft.until)).toBeNull();
    const after = changeMarketingQuery(before, draft);
    expect(after).toMatchObject({ ...before, ...draft, page: 1, leadPage: 1 });
    expect(marketingQueryRanges(after)).toEqual({
      current: draft,
      previous: { since: "2026-10-03", until: "2026-10-09" },
    });
    const month = changeMarketingQuery(after, {
      competence: "2026-09",
      since: undefined,
      until: undefined,
    });
    expect(month.agency).toBe("morar");
    expect(month.accountId).toBe("123");
    expect(month.leadFormId).toBe("456");
    expect(marketingQueryRanges(month, new Date("2026-10-28T15:00:00Z")).current).toEqual({
      since: "2026-09-01",
      until: "2026-09-30",
    });
  });
});
