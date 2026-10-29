import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { GoogleMarketingView } from "../../src/components/marketing/GoogleMarketingView";
import {
  googleMetricValue,
  googleRatio,
  googleTrendBuckets,
} from "../../src/components/marketing/google-metrics";
import {
  googleColumnsFromPreference,
  toggleGoogleColumn,
  googleColumnPreferenceKey,
} from "../../src/components/marketing/google-campaign-columns";
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
    expect(googleMetricValue("0")).toBe("0");
    expect(googleMetricValue("0", "BRL", true)).toBe("R$ 0,00");
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
    const $ = load(html);
    expect($("[data-coverage=partial]").text()).toBe("Dados parciais");
    expect(
      $("button").filter((_index, button) => $(button).text() === "Informações dos dados"),
    ).toHaveLength(1);
    expect(html).toContain("2,75");
    expect(html).toContain("Evolução indisponível");
    expect(html).toContain("—");
    expect(html).toContain("Ativa");
    expect($("thead th[title='Status registrado no Gestão']").text()).toBe("Status");
    for (const phrase of [
      "Valores observados",
      "Cobertura do período não comprovada",
      "Última coleta",
      "Eixo esquerdo:",
      "Datas sem coleta mantêm lacunas",
      "Períodos com lacunas não são somados",
      "Comparação com período anterior indisponível",
      "status nativo Google ainda não comprovado",
    ])
      expect($.text()).not.toContain(phrase);
    expect($.text()).not.toContain("America/Sao_Paulo");
    expect($.text()).not.toContain("BRL");
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
    expect(html).toContain("Conta sintética");
    expect(html).toContain("Status registrado no Gestão");
    expect(html).toContain("Ativa");
    expect(html).not.toContain("ainda não estão disponíveis");
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
      "Status",
      "Tipo",
      "Custo",
      "Impressões",
      "Cliques",
      "Conversões",
      "Custo / conversão",
      "CTR",
      "CPC médio",
    ]);
    expect($("[role=combobox][aria-label='Ordenar campanhas']")).toHaveLength(1);
    expect($("button").filter((_index, button) => $(button).text() === "Colunas")).toHaveLength(1);
    expect(
      $("[role=region][aria-label='Tabela de campanhas, com rolagem horizontal']").attr("tabindex"),
    ).toBe("0");
    expect($("tbody th[scope=row] button").attr("title")).toBe("Busca");
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

  it("keeps measured zero distinct from unavailable indicators and labels every selector", () => {
    const measuredZero = {
      ...data,
      summary: { ...empty, cost: "0", clicks: "0", conversions: "0" },
    };
    const $ = load(
      renderToStaticMarkup(
        createElement(GoogleMarketingView, { data: measuredZero, area: "overview", ...callbacks }),
      ),
    );
    const indicators = $("section[aria-label='Indicadores Google Ads'] article");
    expect(indicators).toHaveLength(4);
    expect(indicators.map((_index, article) => $(article).find("p").text()).get()).toEqual([
      "R$ 0,00",
      "0",
      "0",
      "—",
    ]);
    for (let index = 1; index <= 4; index += 1) {
      expect(indicators.find(`[role=combobox][aria-label='Indicador ${index}']`)).toHaveLength(1);
    }
    const unavailable = load(
      renderToStaticMarkup(
        createElement(GoogleMarketingView, {
          data: { ...measuredZero, coverage: "unavailable", summary: { ...empty } },
          area: "overview",
          ...callbacks,
        }),
      ),
    );
    expect(unavailable("[data-coverage=unavailable]").text()).toBe("Sem dados no período");
    expect(
      unavailable("section[aria-label='Indicadores Google Ads'] article p")
        .map((_index, p) => unavailable(p).text())
        .get(),
    ).toEqual(["—", "—", "—", "—"]);
  });

  it("uses the authorized full-scope summary and count without summing the current campaign page", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(GoogleMarketingView, {
          data: { ...data, total: 51, summary: { ...data.summary, clicks: "999" } },
          area: "overview",
          ...callbacks,
        }),
      ),
    );
    expect($("section[aria-label='Indicadores Google Ads'] article").eq(1).find("p").text()).toBe(
      "999",
    );
    expect($("[aria-label='51 campanhas no escopo selecionado']").text()).toBe("51");
    expect($("tbody tr")).toHaveLength(1);
    expect($("nav[aria-label='Paginação das campanhas Google']").text()).toContain("Página 1 de 3");
  });

  it("derives grouped rates from aggregated measurements rather than averaging daily rates", () => {
    const points = [
      {
        date: "2026-10-01",
        metrics: { ...empty, cost: "3", clicks: "2", impressions: "8", conversions: "0.25" },
      },
      {
        date: "2026-10-02",
        metrics: { ...empty, cost: "7", clicks: "8", impressions: "92", conversions: "1.75" },
      },
    ];
    const [bucket] = googleTrendBuckets(points, "2026-10-01", "2026-10-02", "week")!;
    expect(bucket.metrics.ctr).toBe("10.00");
    expect(bucket.metrics.cpc).toBe("1.00");
    expect(bucket.metrics.costPerConversion).toBe("5.00");
    expect(bucket.metrics.conversions).toBe("2.00");
  });
});
