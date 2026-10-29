import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildMarketingReport, reportScopeSchema } from "./report-model";
import { renderMarketingReport } from "./report-pdf.server";
import type { CampaignRow } from "./marketing.dto";
import { revisionEvidenceEnough } from "../ads/metric-reconciliation";
const scope = {
  imobiliaria: "cordial" as const,
  type: "detailed" as const,
  filters: { since: "2026-10-01", until: "2026-10-28" },
};
export const sampleCampaign = (id = "sample"): CampaignRow => ({
  id,
  user_id: "synthetic",
  imobiliaria: "cordial",
  nome: `Campanha sintética ${id}`,
  canal: "Facebook",
  objetivo: "Leads qualificados",
  status: "Ativa",
  data_inicio: "2026-10-01",
  data_fim: "2026-10-31",
  investimento: 100,
  responsavel: "PRIVATE",
  observacoes: "PRIVATE",
  diagnostico: "PRIVATE",
  referencia_url: null,
  leads_esperados: 4,
  created_at: "2026-10-01",
  updated_at: "2026-10-28",
  platform: "meta",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  daily_metrics: [
    { data: "2026-10-10", leads: 2, clicks: 10, impressions: 100, spend: 12 },
    { data: "2026-10-11", leads: 3, clicks: 90, impressions: 900, spend: 88 },
  ],
});
const source = (items: CampaignRow[], financial = true) => ({
  items,
  total: items.length,
  financial_visible: financial,
  captured_at: "2026-10-28T15:00:00Z",
  funnel: { submissions: 0, attendances: 0, linkedSubmissions: 0 },
});
describe("report scope and shared analytics", () => {
  it("rejects Google anywhere in the complete scope and refuses incomplete snapshots", () => {
    const many = Array.from({ length: 101 }, (_, i) => sampleCampaign(String(i)));
    many[100] = { ...many[100], platform: "google" };
    expect(() => buildMarketingReport(scope, source(many))).toThrow(/Google Ads/);
    expect(() =>
      buildMarketingReport(
        { ...scope, filters: { ...scope.filters, platform: "google" } },
        source([]),
      ),
    ).toThrow(/Google Ads/);
    expect(() =>
      buildMarketingReport(scope, { ...source(many.slice(0, 100)), total: 101 }),
    ).toThrow(/incompleto/);
    expect(() =>
      buildMarketingReport(
        scope,
        source([sampleCampaign(), { ...sampleCampaign("manual"), platform: "manual" }]),
      ),
    ).not.toThrow();
  });
  it("uses weighted ratios, never sums reach and strips contacts/notes", () => {
    const model = buildMarketingReport(scope, source([sampleCampaign()]));
    expect(model.kpis.ctr).toBe(10);
    expect(model.kpis.cpl).toBe(20);
    expect(model.kpis.reach).toBeNull();
    expect(JSON.stringify(model)).not.toContain("PRIVATE");
  });
  it("absence stays unavailable, exact empty evidence stays distinguishable", () => {
    const c = { ...sampleCampaign(), daily_metrics: [], sync_status: "synced" };
    const model = buildMarketingReport(scope, source([c]));
    expect(model.rows[0].coverage).toBe("pending");
    expect(model.rows[0].spend).toBeNull();
    expect(model.rows[0].leads).toBeNull();
    const empty = buildMarketingReport(
      scope,
      source([
        {
          ...c,
          period_insights: { ...scope.filters, reach: null, frequency: null, has_data: false },
        },
      ]),
    );
    expect(empty.rows[0].coverage).toBe("empty");
    expect(empty.rows[0].leads).toBe(0);
    const incomplete = buildMarketingReport(
      scope,
      source([
        { ...c, period_insights: { ...scope.filters, reach: 100, frequency: 2, has_data: true } },
      ]),
    );
    expect(incomplete.rows[0].coverage).toBe("partial");
    expect(incomplete.rows[0].leads).toBeNull();
    expect(incomplete.rows[0].spend).toBeNull();
  });
  it("masks all derived finance and refuses cross-currency addition", () => {
    const protectedModel = buildMarketingReport(scope, source([sampleCampaign()], false));
    expect(protectedModel.kpis.spend).toBeNull();
    expect(protectedModel.kpis.cpc).toBeNull();
    expect(protectedModel.rows[0].cpl).toBeNull();
    expect(
      buildMarketingReport(
        scope,
        source([sampleCampaign(), { ...sampleCampaign("usd"), currency: "USD" }]),
      ).kpis.spend,
    ).toBeNull();
  });
  it("rejects invalid calendar dates and oversized ranges", () => {
    expect(
      reportScopeSchema.safeParse({
        ...scope,
        filters: { since: "2026-02-30", until: "2026-03-01" },
      }).success,
    ).toBe(false);
    expect(
      reportScopeSchema.safeParse({
        ...scope,
        filters: { since: "2024-01-01", until: "2026-03-01" },
      }).success,
    ).toBe(false);
  });
  it("renders all 126 records over several pages, without a screenshot", async () => {
    const model = buildMarketingReport(
      scope,
      source(Array.from({ length: 126 }, (_, i) => sampleCampaign(String(i)))),
    );
    const bytes = await renderMarketingReport(model);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
    expect(model.rows).toHaveLength(126);
  });
});
it("a disappearing positive day requires delayed independent reads and matching totals", () => {
  const evidence = {
    firstSeen: "2026-10-28T10:00:00Z",
    now: Date.parse("2026-10-28T10:11:00Z"),
    missingDays: ["2026-10-01"],
    verifiedEmptyDays: ["2026-10-01"],
    dailyImpressions: 10,
    periodImpressions: 10,
    dailySpend: 2,
    periodSpend: 2,
  };
  expect(revisionEvidenceEnough(evidence)).toBe(true);
  expect(revisionEvidenceEnough({ ...evidence, verifiedEmptyDays: [] })).toBe(false);
  expect(revisionEvidenceEnough({ ...evidence, now: Date.parse("2026-10-28T10:01:00Z") })).toBe(
    false,
  );
  expect(revisionEvidenceEnough({ ...evidence, periodSpend: null })).toBe(false);
  expect(revisionEvidenceEnough({ ...evidence, periodImpressions: 11 })).toBe(false);
});
