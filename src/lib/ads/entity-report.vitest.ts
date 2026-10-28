import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildEntityReport, reportNumber, type EntityReportSource } from "./entity-report.model";
import { entityInsightTotals } from "./entity-insights.model";
import { renderMarketingReport } from "@/lib/marketing/report-pdf.server";

export function syntheticEntityReportSource(count = 28): EntityReportSource {
  return {
    jobId: "11111111-1111-4111-8111-111111111111",
    campaignId: "22222222-2222-4222-8222-222222222222",
    imobiliaria: "cordial",
    accountId: "1001",
    level: "ad",
    grain: "period",
    breakdown: "none",
    since: "2026-10-01",
    until: "2026-10-28",
    completedAt: "2026-10-28T15:00:00Z",
    capturedAt: "2026-10-28T16:00:00Z",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    apiVersion: "v26.0",
    attributionRequested: {
      use_unified_attribution_setting: true,
      action_report_time: "impression",
    },
    financialVisible: true,
    total: count,
    rows: Array.from({ length: count }, (_, i) => ({
      entityId: String(10000 + i),
      accountId: "1001",
      campaignId: "2001",
      adsetId: "3001",
      dateStart: "2026-10-01",
      dateStop: "2026-10-28",
      breakdown: {},
      impressions: String(100 + i * 10),
      clicks: String(2 + i),
      inlineLinkClicks: "1",
      spend: "12.34",
      leads: "1",
      leadActionType: "onsite_conversion.lead_grouped",
      reach: "80",
      frequency: "1.25",
      landingPageViews: null,
      attribution: null,
    })),
  };
}
describe("entity PDF snapshot — synthetic source only", () => {
  it("exports the full fixed snapshot with exactly the shared weighted math", () => {
    const source = syntheticEntityReportSource(28),
      total = entityInsightTotals(source.rows, source.currency);
    const report = buildEntityReport(source);
    expect(report.total).toBe(28);
    expect(report.rows).toHaveLength(28);
    expect(report.kpis.ctr).toBe(total.ctr);
    expect(report.kpis.spend).toBe(Number(total.spend));
    expect(report.kpis.reach).toBeNull();
    expect(report.entity?.snapshotJobId).toBe(source.jobId);
    expect(report.trend).toEqual([]);
    expect(() => buildEntityReport({ ...source, rows: source.rows.slice(0, 25) })).toThrow(
      /Snapshot incompleto/,
    );
  });
  it("masks spend and every derived cost again before persistence", () => {
    const report = buildEntityReport({ ...syntheticEntityReportSource(), financialVisible: false });
    expect(report.kpis.spend).toBeNull();
    expect(report.kpis.cpc).toBeNull();
    expect(report.kpis.cpm).toBeNull();
    expect(report.kpis.cpl).toBeNull();
    expect(report.rows.every((r) => r.spend === null && r.cpl === null)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("12.34");
  });
  it("retains unknown leads instead of zero and refuses incompatible action totals", () => {
    const source = syntheticEntityReportSource(2);
    source.rows[0].leads = null;
    source.rows[0].leadActionType = null;
    const report = buildEntityReport(source);
    expect(report.kpis.leads).toBeNull();
    expect(report.kpis.cpl).toBeNull();
    expect(report.rows[0].leads).toBeNull();
    expect(report.rows[1].leads).toBe(1);
  });
  it("does not silently round large decimal values for the PDF", () => {
    expect(reportNumber("0.000001")).toBe(0.000001);
    expect(reportNumber("12.3400")).toBe(12.34);
    expect(() => reportNumber("9007199254740991.01")).toThrow(/Precisão/);
    expect(() => reportNumber("12345678901234567890")).toThrow(/Precisão/);
  });
  it("renders every row over multiple pages with an explicit entity title", async () => {
    const report = buildEntityReport(syntheticEntityReportSource(70));
    const bytes = await renderMarketingReport(report, { synthetic: true });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toContain("Desempenho de anúncios");
    expect(doc.getPageCount()).toBeGreaterThan(4);
    expect(bytes.byteLength).toBeLessThan(10 * 1024 * 1024);
  });
});
