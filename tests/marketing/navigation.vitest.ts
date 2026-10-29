import { describe, expect, it, vi } from "vitest";
import { marketingActionAllowed } from "../../src/lib/marketing/action-access";
import {
  changeMarketingQuery,
  marketingSearchSchema,
  marketingQueryRanges,
} from "../../src/lib/marketing/query-state";
import {
  accountDateTime,
  accountDateTimeInput,
  brlAmountMinor,
} from "../../src/lib/marketing/draft-input";

describe("Marketing navigation context", () => {
  it("resolves the default month when parsing even if the module loaded at epoch", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      vi.resetModules();
      const { marketingSearchSchema: loadedAtEpoch } =
        await import("../../src/lib/marketing/query-state");
      vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
      expect(loadedAtEpoch.parse({}).competence).toBe("2026-10");
      expect(loadedAtEpoch.parse({ competence: "invalid" }).competence).toBe("2026-10");
      vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
      expect(loadedAtEpoch.parse({}).competence).toBe("2026-11");
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps agency, account, search, sort and both list pages while switching areas", () => {
    const before = marketingSearchSchema.parse({
      area: "campaigns",
      agency: "morar",
      accountId: "123",
      search: "Centro",
      page: 4,
      leadPage: 2,
      leadStatus: "review",
      sort: "name",
      competence: "2026-10",
    });
    const reports = changeMarketingQuery(before, { area: "reports" });
    expect(changeMarketingQuery(reports, { area: "campaigns" })).toEqual(before);
  });
  it("resets only affected pagination", () => {
    const before = marketingSearchSchema.parse({ page: 4, leadPage: 3 });
    expect(changeMarketingQuery(before, { search: "Casa" })).toMatchObject({
      page: 1,
      leadPage: 3,
    });
    expect(changeMarketingQuery(before, { leadStatus: "failed" })).toMatchObject({
      page: 4,
      leadPage: 1,
    });
    expect(
      changeMarketingQuery(before, { since: "2026-10-10", until: "2026-10-16" }),
    ).toMatchObject({ page: 1, leadPage: 1 });
    expect(changeMarketingQuery(before, { accountId: "987" })).toMatchObject({
      page: 1,
      leadPage: 1,
    });
    expect(changeMarketingQuery(before, { agency: "morar" })).toMatchObject({
      page: 1,
      leadPage: 1,
    });
  });
  it("does not accept arbitrary URL areas, IDs or unbounded pagination", () => {
    expect(
      marketingSearchSchema.parse({
        area: "admin",
        accountId: "123/contacts",
        page: -3,
        leadPage: 999999,
      }),
    ).toMatchObject({ area: "overview", accountId: "", page: 1, leadPage: 1 });
  });
  it("preserves Google scope on entering and restoring Leads without querying Meta by coercion", () => {
    const google = marketingSearchSchema.parse({
      area: "campaigns",
      platform: "google",
      accountId: "123",
      agency: "morar",
    });
    const leads = changeMarketingQuery(google, { area: "leads" });
    expect(leads).toMatchObject({ platform: "google", accountId: "123", agency: "morar" });
    expect(marketingSearchSchema.parse(leads)).toEqual(leads);
    expect(changeMarketingQuery(leads, { area: "campaigns" })).toEqual(google);
  });
  it("clears an account and resets both pages when the platform changes", () => {
    const meta = marketingSearchSchema.parse({
      platform: "meta",
      accountId: "123",
      page: 4,
      leadPage: 3,
    });
    expect(changeMarketingQuery(meta, { platform: "google" })).toMatchObject({
      platform: "google",
      accountId: "",
      page: 1,
      leadPage: 1,
    });
  });
});
describe("Custom calendar ranges", () => {
  it("keeps the selected calendar cut explicit around account midnight", () => {
    const query = marketingSearchSchema.parse({ competence: "2026-10" });
    const instant = new Date("2026-10-29T03:30:00Z");
    const selectedRange = marketingQueryRanges(query, instant);
    expect(selectedRange.current.until).toBe("2026-10-29");
    expect(selectedRange.previous.until).toBe("2026-09-29");
    expect(marketingQueryRanges(query, instant, "America/Manaus").current.until).toBe("2026-10-28");
  });
  it("compares equal calendar spans without browser-zone conversions", () => {
    const query = marketingSearchSchema.parse({
      competence: "2026-10",
      since: "2026-10-10",
      until: "2026-10-16",
    });
    expect(marketingQueryRanges(query)).toEqual({
      current: { since: "2026-10-10", until: "2026-10-16" },
      previous: { since: "2026-10-03", until: "2026-10-09" },
    });
  });
  it("rejects invalid ranges and dates without breaking navigation", () => {
    const query = marketingSearchSchema.parse({ since: "2026-02-31", until: "bad" });
    expect(query.since).toBeUndefined();
    expect(query.until).toBeUndefined();
    expect(
      marketingQueryRanges(
        marketingSearchSchema.parse({
          competence: "2026-10",
          since: "2026-10-20",
          until: "2026-10-10",
        }),
        new Date("2026-11-01T12:00:00Z"),
      ).current,
    ).toEqual({ since: "2026-10-01", until: "2026-10-31" });
  });
});
describe("Ad draft amount and account calendar", () => {
  it("parses BRL without rounding monetary fractions", () => {
    expect(brlAmountMinor("0,01")).toBe("1");
    expect(brlAmountMinor("9999999,99")).toBe("999999999");
    expect(brlAmountMinor("50.5")).toBe("5050");
    expect(brlAmountMinor("1,999")).toBeUndefined();
    expect(brlAmountMinor("-1")).toBeUndefined();
    expect(brlAmountMinor("0")).toBeUndefined();
  });
  it("uses the account timezone rather than the browser timezone", () => {
    expect(accountDateTime("2026-10-28T09:30", "America/Sao_Paulo")).toBe(
      "2026-10-28T12:30:00.000Z",
    );
    expect(accountDateTime("2026-10-28T09:30", "America/Manaus")).toBe("2026-10-28T13:30:00.000Z");
    expect(accountDateTimeInput("2026-10-28T13:30:00.000Z", "America/Manaus")).toBe(
      "2026-10-28T09:30",
    );
  });
  it("round trips a typed calendar value through persisted JSON", () => {
    const typed = "2026-11-01T09:00";
    const payload = { budget: { startTime: accountDateTime(typed, "America/Sao_Paulo") } };
    const restored = JSON.parse(JSON.stringify(payload));
    expect(restored.budget.startTime).toBe("2026-11-01T12:00:00.000Z");
    expect(accountDateTimeInput(restored.budget.startTime, "America/Sao_Paulo")).toBe(typed);
  });
  it("rejects nonexistent calendar times", () => {
    expect(accountDateTime("2026-03-08T02:30", "America/New_York")).toBeUndefined();
    expect(accountDateTime("2026-02-31T10:00", "America/Sao_Paulo")).toBeUndefined();
  });
});

describe("Scoped operational capabilities", () => {
  const grant = {
    cordial: { create_draft: true, read_ad_budget: true, send_paused: true },
    morar: { create_draft: false },
  };
  it("does not treat a named operational grant as financial or connection administration", () => {
    expect(marketingActionAllowed(grant, "send_paused", "cordial", "secretaria")).toBe(true);
    expect(marketingActionAllowed(grant, "financial_report", "cordial", "secretaria")).toBe(false);
    expect(marketingActionAllowed(grant, "manage_connection", "cordial", "secretaria")).toBe(false);
  });
  it("keeps unknown permissions and another agency denied", () => {
    expect(marketingActionAllowed(undefined, "create_draft", "cordial", "admin_owner")).toBe(false);
    expect(marketingActionAllowed(grant, "create_draft", "morar", "secretaria")).toBe(false);
    expect(marketingActionAllowed(grant, "create_draft", "arbitrary", "secretaria")).toBe(false);
    expect(marketingActionAllowed(grant, "create_draft", "todas", "secretaria")).toBe(true);
  });
  it("keeps the review surface dominant even if an old capability response has a grant", () => {
    expect(marketingActionAllowed(grant, "send_paused", "cordial", "meta_reviewer")).toBe(false);
    expect(marketingActionAllowed(grant, "read_ad_budget", "cordial", "meta_reviewer")).toBe(false);
  });
});
