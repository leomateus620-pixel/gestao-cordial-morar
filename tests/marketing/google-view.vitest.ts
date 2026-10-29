import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import {
  GoogleMarketingView,
  googleMetricValue,
  googleRatio,
  googleTrendBuckets,
  googleColumnsFromPreference,
  toggleGoogleColumn,
  googleColumnPreferenceKey,
} from "../../src/components/marketing/GoogleMarketingView";
import type { GoogleMarketingOverview } from "../../src/lib/marketing/google-overview.types";

const empty = {
  cost: null,
  clicks: null,
  impressions: null,
  conversions: null,
  ctr: null,
  cpc: null,
  costPerConversion: null,
};
const data: GoogleMarketingOverview = {
  scope: { agency: "cordial", accountId: "1234567890", since: "2026-10-01", until: "2026-10-31" },
  coverage: "partial",
  accounts: [{ id: "1234567890", name: "Conta sintética", agency: "cordial" }],
  accountName: "Conta sintética",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  lastCollectedAt: null,
  summary: { ...empty, cost: "12.345678", clicks: "8", conversions: "2.75" },
  series: null,
  page: 1,
  pageSize: 25,
  total: 1,
  sort: "name_asc",
  items: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Busca",
      status: "Ativa",
      nativeStatus: null,
      channelType: null,
      channelSubtype: null,
      accountId: "1234567890",
      accountName: "Conta sintética",
      dataInicio: "2026-10-01",
      dataFim: "2037-12-30",
      agency: "cordial",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      lastCollectedAt: null,
      coverage: "partial",
      metrics: { ...empty, clicks: "8", conversions: "2.75" },
      dailySeries: null,
    },
  ],
};
const callbacks = { onSelect: vi.fn(), onPage: vi.fn(), onSort: vi.fn() };

describe("Google Marketing view", () => {
  it("keeps decimal and int64 values exact until presentation", () => {
    expect(googleMetricValue("2.75")).toBe("2,75");
    expect(googleMetricValue("9223372036854775807")).toBe("9.223.372.036.854.775.807");
    expect(googleMetricValue("12.345678", "BRL", true)).toBe("R$ 12,35");
    expect(googleMetricValue(null, "BRL", true)).toBe("—");
    expect(googleMetricValue("2.0", null, true)).toBe("—");
    expect(googleRatio("9223372036854775807", "10000000000000000000", 100)).toBe("92.23");
    expect(googleRatio("0", "0")).toBeNull();
    expect(googleMetricValue("-12.345", "BRL", true)).toBe("−R$ 12,35");
  });
  it("preserves missing dates as gaps and does not invent complete weekly totals", () => {
    const measured = { ...empty, cost: "3.123456", clicks: "2", impressions: "8" };
    const points = [
      { date: "2026-10-01", metrics: measured },
      { date: "2026-10-03", metrics: measured },
    ];
    const days = googleTrendBuckets(points, "2026-10-01", "2026-10-03", "day")!;
    expect(days.map((point) => point.metrics.clicks)).toEqual(["2", null, "2"]);
    expect(
      googleTrendBuckets(points, "2026-10-01", "2026-10-03", "week")![0].metrics.clicks,
    ).toBeNull();
    expect(
      googleTrendBuckets(points, "2026-10-01", "2026-10-03", "month")![0].metrics.cost,
    ).toBeNull();
  });
  it("identifies partial coverage and does not label absent metrics zero", () => {
    const html = renderToStaticMarkup(
      createElement(GoogleMarketingView, { data, area: "overview", ...callbacks }),
    );
    expect(html).toContain("cobertura do período não comprovada");
    expect(html).toContain("2,75");
    expect(html).toContain("Evolução indisponível");
    expect(html).toContain("Não disponível");
    expect(html).toContain("—");
    expect(html).toContain("Status registrado");
    expect(html).toContain("status nativo Google ainda não comprovado");
    expect(html).toContain("Ativa");
  });
  it("preserves campaign-specific scope in its detail without inventing hierarchy", () => {
    const html = renderToStaticMarkup(
      createElement(GoogleMarketingView, {
        data,
        area: "campaigns",
        selectedId: data.items[0].id,
        ...callbacks,
      }),
    );
    expect(html).toContain("Busca");
    expect(html).toContain("1234567890");
    expect(html).toContain("ainda não estão disponíveis");
  });
  it("starts with the requested columns and allows other columns to be selected or restored", () => {
    const html = renderToStaticMarkup(
      createElement(GoogleMarketingView, { data, area: "campaigns", ...callbacks }),
    );
    const $ = load(html);
    expect(
      $("table thead th")
        .map((_i, el) => $(el).text())
        .get(),
    ).toEqual([
      "Campanha",
      "Status registrado",
      "Tipo",
      "Custo",
      "Impressões",
      "Cliques",
      "Conversões",
      "Custo / conversão",
      "CTR",
      "CPC médio",
    ]);
    expect($("fieldset input[type=checkbox]")).toHaveLength(9);
    const columnPanel = $("fieldset").parent();
    expect(columnPanel.hasClass("left-0")).toBe(true);
    expect(columnPanel.hasClass("sm:right-0")).toBe(true);
    expect(columnPanel.hasClass("bg-popover")).toBe(true);
    const defaults = googleColumnsFromPreference(null);
    const hidden = toggleGoogleColumn(defaults, "clicks", false);
    expect(hidden).not.toContain("clicks");
    expect(toggleGoogleColumn(hidden, "ctr", true)).toContain("ctr");
    expect(googleColumnsFromPreference(["invalid"])).toEqual(defaults);
    expect(googleColumnPreferenceKey("user-a", "cordial")).not.toEqual(
      googleColumnPreferenceKey("user-b", "cordial"),
    );
    expect(googleColumnPreferenceKey("user-a", "cordial")).not.toEqual(
      googleColumnPreferenceKey("user-a", "morar"),
    );
  });
});
