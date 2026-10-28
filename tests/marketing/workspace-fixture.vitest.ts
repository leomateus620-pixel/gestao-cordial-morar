import { afterEach, describe, expect, it, vi } from "vitest";
import { readAllCampaigns } from "../../src/lib/marketing/read-all-campaigns";

/** Tests the isolated transport used as visual evidence, not authorization in production. */
async function preview(search = "") {
  vi.resetModules();
  vi.stubGlobal("location", { search });
  return import("./transport-fixture");
}
afterEach(() => vi.unstubAllGlobals());

describe("Marketing workspace synthetic evidence transport", () => {
  it("keeps list pagination separate from full-filter summaries and reports", async () => {
    const transport = await preview("?campaignCount=125");
    const filters = {
      since: "2026-09-01",
      until: "2026-10-28",
      currentSince: "2026-10-01",
      previousUntil: "2026-09-28",
    };
    const first = await transport.listCampaignPage({ data: { ...filters, page: 1, pageSize: 25 } });
    const second = await transport.listCampaignPage({
      data: { ...filters, page: 2, pageSize: 25 },
    });
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(25);
    expect(first.total).toBe(125);
    expect(first.summary).toEqual(second.summary);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(50);
    const complete = await readAllCampaigns(
      (data) => transport.listCampaignPage({ data }),
      filters,
    );
    expect(complete.items).toHaveLength(125);
    expect(
      complete.items.reduce(
        (sum, row) => sum + row.dailyMetrics.reduce((days, day) => days + day.leads, 0),
        0,
      ),
    ).toBe(first.summary.current.leads);
  });

  it("offers full long names and real previous-period observations only when requested", async () => {
    const original = await preview();
    expect(original.fixtureCampaigns[0].name).toBe("Captação de imóveis · Cordial");
    expect(
      original.fixtureCampaigns[0].dailyMetrics.some((day) => day.date.startsWith("2026-09")),
    ).toBe(false);
    const comparison = await preview("?longNames=1&comparison=1");
    expect(comparison.fixtureCampaigns[0].name).toContain("nome completo preservado");
    expect(
      comparison.fixtureCampaigns[0].dailyMetrics.find((day) => day.date === "2026-09-01")?.leads,
    ).toBe(1);
    expect(
      comparison.fixtureCampaigns[0].dailyMetrics.find((day) => day.date === "2026-10-01")?.leads,
    ).toBe(2);
  });

  it("keeps missing days absent and queued synchronization distinct from success", async () => {
    const incomplete = await preview("?state=incomplete");
    expect(
      incomplete.fixtureCampaigns[0].dailyMetrics.find((day) => day.date === "2026-10-10"),
    ).toBeUndefined();
    const pending = await preview("?state=pending");
    expect(pending.fixtureCampaigns.every((row) => row.syncStatus === "queued")).toBe(true);
    expect((await pending.listAdSyncJobs())[0].status).toBe("queued");
  });

  it.each(["secretaria", "bianca", "meta_reviewer"])(
    "never includes financial values in fixture transport for %s",
    async (role) => {
      const transport = await preview(`?role=${role}`);
      const page = await transport.listCampaignPage();
      expect(page.financialVisible).toBe(false);
      expect(page.summary.current.spend).toBeNull();
      for (const row of page.items) {
        expect(row.investment).toBeNull();
        expect(row.costPerLead).toBeNull();
        expect(row.dailyMetrics.every((day) => !("spend" in day))).toBe(true);
      }
    },
  );

  it("actually applies inbox search, form, campaign, owner and dates for browser validation", async () => {
    const transport = await preview();
    const selected = await transport.listMetaLeads({
      data: { search: "demonstração", formId: "50001", since: "2026-10-26", until: "2026-10-26" },
    });
    expect(selected.total).toBe(1);
    expect(
      (await transport.listMetaLeads({ data: { campaignId: "unknown-campaign" } })).total,
    ).toBe(0);
    expect((await transport.listMetaLeads({ data: { brokerId: "unassigned-broker" } })).total).toBe(
      0,
    );
    expect((await transport.listMetaLeads({ data: { since: "2026-10-27" } })).total).toBe(0);
    expect((await transport.listMetaLeads({ data: { search: "missing-contact" } })).total).toBe(0);
  });

  it("preserves explicit empty/error lead states separately", async () => {
    const empty = await preview("?leadState=empty");
    expect(await empty.listMetaLeads()).toEqual({ items: [], total: 0 });
    const error = await preview("?leadState=error");
    await expect(error.listMetaLeads()).rejects.toThrow("Falha sintética");
  });
});
