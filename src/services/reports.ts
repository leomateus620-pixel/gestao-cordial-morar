import {
  chartAccent,
  chartCordial,
  chartDanger,
  chartGraphite,
  chartMorar,
  chartMuted,
  chartSuccess,
  chartSystem,
  chartWarning,
} from "@/lib/chart-palette";
import { brl } from "@/lib/format";
import type { Agenciamento } from "@/types/agenciamento";
import type { Atendimento } from "@/types/atendimento";
import type { Client } from "@/types/client";
import type { Corretor } from "@/types/corretor";
import type { MarketingCampaign, MarketingDailyMetric } from "@/types/marketing";
import type { RentalContractFull } from "@/types/rental";
import type { SaleRecord } from "@/types/sale";
import type {
  ReportsAreaId,
  ReportsAreaSummary,
  ReportsChartConfig,
  ReportsChartPoint,
  ReportsComparisonMode,
  ReportsDateRange,
  ReportsDelta,
  ReportsInsightItem,
  ReportsKpi,
  ReportsOverview,
  ReportsPeriodPreset,
  ReportsRankingGroup,
  ReportsRankingItem,
  ReportsSourceState,
  ReportsTone,
  ReportsValueKind,
} from "@/types/reports";
import type { Lancamento } from "@/lib/mock/data";

type AgencyFilter = "todas" | "cordial" | "morar";

export type ReportsDataInput = {
  periodPreset: ReportsPeriodPreset;
  comparisonMode: ReportsComparisonMode;
  customStart?: string;
  customEnd?: string;
  agency: AgencyFilter;
  agenciamentos: Agenciamento[];
  atendimentos: Atendimento[];
  clients: Client[];
  rentals: RentalContractFull[];
  sales: SaleRecord[];
  lancamentos: Lancamento[];
  campaigns: MarketingCampaign[];
  corretores: Corretor[];
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>;
  today?: Date;
};

type ScopedReportData = {
  agenciamentos: Agenciamento[];
  atendimentos: Atendimento[];
  clients: Client[];
  rentals: RentalContractFull[];
  sales: SaleRecord[];
  lancamentos: Lancamento[];
  campaigns: MarketingCampaign[];
  corretores: Corretor[];
};

type MarketingDay = MarketingDailyMetric & {
  campaignId: string;
  campaignName: string;
  channel: string;
  investment: number;
};

type PeriodFacts = {
  agenciamentos: Agenciamento[];
  atendimentos: Atendimento[];
  clients: Client[];
  rentals: RentalContractFull[];
  closedRentals: RentalContractFull[];
  sales: SaleRecord[];
  closedSales: SaleRecord[];
  lancamentos: Lancamento[];
  marketingDays: MarketingDay[];
  campaigns: MarketingCampaign[];
  agenciamentosCount: number;
  atendimentosCount: number;
  clientsCount: number;
  closedRentalsCount: number;
  closedSalesCount: number;
  rentalValue: number;
  soldValue: number;
  financeRevenue: number;
  financeExpense: number;
  financeBalance: number;
  marketingLeads: number;
  marketingClicks: number;
  marketingViews: number;
  marketingInvestment: number;
  overallConversion: number;
};

type MutableBucket = {
  key: string;
  label: string;
  tooltipLabel: string;
  start: Date;
  end: Date;
  values: Record<string, number>;
};

const MS_DAY = 24 * 60 * 60 * 1000;

export function getDefaultReportsCustomRange(today = new Date()) {
  return {
    start: toInputDate(startOfMonth(today)),
    end: toInputDate(today),
  };
}

export function buildReportsOverview(input: ReportsDataInput): ReportsOverview {
  const today = input.today ?? new Date();
  const period = getReportPeriod(input.periodPreset, input.customStart, input.customEnd, today);
  const comparison = getComparisonPeriod(input.comparisonMode, period.range);
  const scoped = scopeDataByAgency(input);
  const current = buildPeriodFacts(scoped, period.range);
  const previous = comparison.range ? buildPeriodFacts(scoped, comparison.range) : null;

  const kpis = buildExecutiveKpis(current, previous);
  const areas = [
    buildAgenciamentosArea(scoped, current, previous, period.range, input.sourceStates),
    buildAtendimentosArea(scoped, current, previous, period.range, input.sourceStates),
    buildClientesArea(scoped, current, previous, period.range, input.sourceStates),
    buildAlugueisArea(scoped, current, previous, period.range, input.sourceStates),
    buildVendasArea(scoped, current, previous, period.range, input.sourceStates),
    buildFinanceiroArea(scoped, current, previous, period.range, input.sourceStates),
    buildMarketingArea(scoped, current, previous, period.range, input.sourceStates),
  ];
  const crossAreaComparisons = buildCrossAreaComparisons(scoped, period.range);
  const rankings = buildGlobalRankings(scoped, current);
  const insights = buildGlobalInsights(current, previous, areas, rankings);

  return {
    period: {
      preset: input.periodPreset,
      label: period.label,
      range: period.range,
    },
    comparison,
    kpis,
    areas,
    crossAreaComparisons,
    insights,
    rankings,
    hasAnyData: areas.some((area) => area.state.status === "ready"),
  };
}

function buildExecutiveKpis(current: PeriodFacts, previous: PeriodFacts | null): ReportsKpi[] {
  return [
    buildKpi({
      id: "agenciamentos",
      label: "Agenciamentos no período",
      value: current.agenciamentosCount,
      previousValue: previous?.agenciamentosCount,
      helper: "imóveis captados ou registrados",
      area: "agenciamentos",
      valueKind: "number",
      tone: "info",
    }),
    buildKpi({
      id: "atendimentos",
      label: "Atendimentos realizados",
      value: current.atendimentosCount,
      previousValue: previous?.atendimentosCount,
      helper: "contatos comerciais no recorte",
      area: "atendimentos",
      valueKind: "number",
      tone: "info",
    }),
    buildKpi({
      id: "clientes",
      label: "Novos clientes",
      value: current.clientsCount,
      previousValue: previous?.clientsCount,
      helper: "cadastros criados no período",
      area: "clientes",
      valueKind: "number",
      tone: "positive",
    }),
    buildKpi({
      id: "alugueis",
      label: "Aluguéis fechados",
      value: current.closedRentalsCount,
      previousValue: previous?.closedRentalsCount,
      helper: "contratos iniciados no período",
      area: "alugueis",
      valueKind: "number",
      tone: "positive",
    }),
    buildKpi({
      id: "vendas",
      label: "Vendas fechadas",
      value: current.closedSalesCount,
      previousValue: previous?.closedSalesCount,
      helper: "vendas concluídas no recorte",
      area: "vendas",
      valueKind: "number",
      tone: "positive",
    }),
    buildKpi({
      id: "receita",
      label: "Receita financeira",
      value: current.financeRevenue,
      previousValue: previous?.financeRevenue,
      helper: "entradas registradas no financeiro",
      area: "financeiro",
      valueKind: "currency",
      tone: "positive",
    }),
    buildKpi({
      id: "leads",
      label: "Leads de marketing",
      value: current.marketingLeads,
      previousValue: previous?.marketingLeads,
      helper: "leads informados nas campanhas",
      area: "marketing",
      valueKind: "number",
      tone: "info",
    }),
    {
      id: "conversao",
      label: "Conversão geral",
      value: current.overallConversion,
      formattedValue: formatValue(current.overallConversion, "percent"),
      helper: "fechamentos sobre leads, clientes e atendimentos",
      area: "geral",
      valueKind: "percent",
      delta: previous
        ? buildPointDelta(current.overallConversion, previous.overallConversion)
        : undefined,
      tone: "positive",
    },
  ];
}

function buildAgenciamentosArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildSingleMetricChart({
    id: "agenciamentos-evolucao",
    title: "Evolução de agenciamentos",
    subtitle: "Novas captações distribuídas no período selecionado.",
    range,
    items: scoped.agenciamentos.map((item) => ({
      date: parseDate(item.dataAgenciamento) ?? parseDate(item.criadoEm),
      value: 1,
    })),
    dataKey: "total",
    seriesLabel: "Agenciamentos",
    color: chartCordial,
    kind: "bar",
    valueKind: "number",
    emptyTitle: "Nenhum agenciamento no período.",
    emptyDescription: "Quando a equipe registrar captações, a evolução aparecerá aqui.",
  });
  const topBairros = rankByText(
    current.agenciamentos,
    (item) => item.bairro,
    (name, count, max) => ({
      id: `ag-bairro-${normalizeKey(name)}`,
      name,
      subtitle: "bairro com captação registrada",
      value: formatCount(count, "agenciamento"),
      progress: getProgress(count, max),
    }),
  );
  const delta = previous
    ? buildDelta(current.agenciamentosCount, previous.agenciamentosCount)
    : undefined;

  return {
    id: "agenciamentos",
    title: "Agenciamentos",
    subtitle: "Volume de imóveis captados, validações e concentração por região.",
    metricLabel: "Novos no período",
    metricValue: formatNumber(current.agenciamentosCount),
    metricDetail: `${formatNumber(countBy(current.agenciamentos, (item) => item.status === "validado"))} validado(s)`,
    delta,
    highlights: [
      highlight(
        "ag-validado",
        "Validados",
        countBy(current.agenciamentos, (item) => item.status === "validado"),
      ),
      highlight(
        "ag-site",
        "No site",
        countBy(current.agenciamentos, (item) => item.checklist.cadastradoSite),
      ),
      highlight(
        "ag-placa",
        "Com placa",
        countBy(current.agenciamentos, (item) => item.checklist.placaInstalada),
      ),
    ],
    chart,
    rankings: {
      title: "Top bairros",
      items: topBairros,
      emptyTitle: "Sem bairros para ranquear.",
    },
    insights: buildAreaInsights({
      area: "agenciamentos",
      delta,
      title: "Agenciamentos",
      topItem: topBairros[0],
      topDescription: "concentrou mais imóveis captados no período.",
    }),
    state: resolveAreaState(
      "agenciamentos",
      chartHasData(chart),
      sourceStates,
      "Nenhum dado de agenciamentos disponível.",
      "Ajuste o período ou conecte a origem de agenciamentos para visualizar a análise.",
    ),
  };
}

function buildAtendimentosArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildSingleMetricChart({
    id: "atendimentos-evolucao",
    title: "Volume de atendimentos",
    subtitle: "Entrada comercial por dia, semana ou mês conforme o período.",
    range,
    items: scoped.atendimentos.map((item) => ({ date: parseDate(item.criadoEm), value: 1 })),
    dataKey: "total",
    seriesLabel: "Atendimentos",
    color: chartSystem,
    kind: "area",
    valueKind: "number",
    emptyTitle: "Nenhum atendimento no período.",
    emptyDescription: "Novos contatos comerciais alimentarão este gráfico automaticamente.",
  });
  const stageRanking = rankByText(
    current.atendimentos,
    (item) => atendimentoStatusLabel(item.status),
    (name, count, max) => ({
      id: `at-status-${normalizeKey(name)}`,
      name,
      subtitle: "etapa com maior volume",
      value: formatCount(count, "atendimento"),
      progress: getProgress(count, max),
    }),
  );
  const closed = countBy(current.atendimentos, (item) => item.status === "fechado");
  const delta = previous
    ? buildDelta(current.atendimentosCount, previous.atendimentosCount)
    : undefined;

  return {
    id: "atendimentos",
    title: "Atendimentos",
    subtitle: "Ritmo da fila comercial, etapas mais carregadas e conversão operacional.",
    metricLabel: "Atendimentos",
    metricValue: formatNumber(current.atendimentosCount),
    metricDetail: `${formatNumber(closed)} fechado(s) no recorte`,
    delta,
    highlights: [
      highlight("at-fechados", "Fechados", closed),
      highlight(
        "at-propostas",
        "Propostas",
        countBy(current.atendimentos, (item) => item.status === "proposta_enviada"),
      ),
      highlight(
        "at-retorno",
        "Aguardando retorno",
        countBy(current.atendimentos, (item) => item.status === "aguardando_retorno"),
        "attention",
      ),
    ],
    chart,
    rankings: {
      title: "Etapas com maior volume",
      items: stageRanking,
      emptyTitle: "Sem etapas registradas.",
    },
    insights: buildAreaInsights({
      area: "atendimentos",
      delta,
      title: "Atendimentos",
      topItem: stageRanking[0],
      topDescription: "foi a etapa com maior concentração no período.",
    }),
    state: resolveAreaState(
      "atendimentos",
      chartHasData(chart),
      sourceStates,
      "Nenhum atendimento disponível.",
      "Ajuste o período ou registre novos atendimentos para visualizar a evolução.",
    ),
  };
}

function buildClientesArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildSingleMetricChart({
    id: "clientes-evolucao",
    title: "Entrada de clientes",
    subtitle: "Novos cadastros criados no período selecionado.",
    range,
    items: scoped.clients.map((item) => ({ date: parseDate(item.createdAt), value: 1 })),
    dataKey: "total",
    seriesLabel: "Clientes",
    color: chartSuccess,
    kind: "line",
    valueKind: "number",
    emptyTitle: "Nenhum cliente novo no período.",
    emptyDescription: "Os cadastros criados em Clientes aparecerão nesta análise.",
  });
  const originRanking = rankByText(
    current.clients,
    (item) => leadOriginLabel(item.leadOrigin),
    (name, count, max) => ({
      id: `cl-origem-${normalizeKey(name)}`,
      name,
      subtitle: "origem de cadastro",
      value: formatCount(count, "cliente"),
      progress: getProgress(count, max),
    }),
  );
  const active = countBy(
    current.clients,
    (item) => !["perdido", "sem_retorno"].includes(item.status),
  );
  const converted = countBy(current.clients, (item) => item.status === "fechado");
  const delta = previous ? buildDelta(current.clientsCount, previous.clientsCount) : undefined;

  return {
    id: "clientes",
    title: "Clientes",
    subtitle: "Evolução de cadastros, origens de aquisição e saúde do funil.",
    metricLabel: "Novos clientes",
    metricValue: formatNumber(current.clientsCount),
    metricDetail: `${formatNumber(active)} ativo(s) no período`,
    delta,
    highlights: [
      highlight("cl-ativos", "Ativos", active),
      highlight("cl-convertidos", "Convertidos", converted, "positive"),
      highlight(
        "cl-retorno",
        "Aguardando retorno",
        countBy(current.clients, (item) => item.status === "aguardando_retorno"),
        "attention",
      ),
    ],
    chart,
    rankings: {
      title: "Origem dos clientes",
      items: originRanking,
      emptyTitle: "Sem origens para exibir.",
    },
    insights: buildAreaInsights({
      area: "clientes",
      delta,
      title: "Clientes",
      topItem: originRanking[0],
      topDescription: "gerou a maior entrada de clientes no período.",
    }),
    state: resolveAreaState(
      "clientes",
      chartHasData(chart),
      sourceStates,
      "Nenhum cliente disponível.",
      "Ajuste o período ou registre novos cadastros para acompanhar a aquisição.",
    ),
  };
}

function buildAlugueisArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildSingleMetricChart({
    id: "alugueis-evolucao",
    title: "Valor mensal contratado",
    subtitle: "Soma mensal dos contratos de aluguel iniciados no período.",
    range,
    items: scoped.rentals.map((item) => ({
      date: parseDate(item.dataInicio) ?? parseDate(item.createdAt),
      value: item.status === "cancelado" || item.status === "encerrado" ? 0 : item.valorMensal,
    })),
    dataKey: "valor",
    seriesLabel: "Valor mensal",
    color: chartMorar,
    kind: "bar",
    valueKind: "currency",
    emptyTitle: "Nenhum aluguel fechado no período.",
    emptyDescription: "Contratos de locação iniciados alimentarão o gráfico automaticamente.",
  });
  const neighborhoods = rankByText(
    current.closedRentals,
    (item) => item.property.bairro,
    (name, count, max) => ({
      id: `al-bairro-${normalizeKey(name)}`,
      name,
      subtitle: "bairro com locação iniciada",
      value: formatCount(count, "aluguel"),
      progress: getProgress(count, max),
    }),
  );
  const ticket = current.closedRentalsCount ? current.rentalValue / current.closedRentalsCount : 0;
  const delta = previous
    ? buildDelta(current.closedRentalsCount, previous.closedRentalsCount)
    : undefined;

  return {
    id: "alugueis",
    title: "Aluguéis",
    subtitle: "Contratos iniciados, valor mensal agregado e bairros com maior saída.",
    metricLabel: "Aluguéis fechados",
    metricValue: formatNumber(current.closedRentalsCount),
    metricDetail: `${brl(current.rentalValue, { compact: true })} em valor mensal`,
    delta,
    highlights: [
      highlight("al-ticket", "Ticket médio", ticket, "positive", "currency"),
      highlight(
        "al-ativos",
        "Contratos ativos",
        countBy(current.rentals, (item) => item.status === "ativo"),
      ),
      highlight(
        "al-atrasos",
        "Atrasos",
        countBy(current.rentals, (item) => item.paymentStatus === "atrasado"),
        "attention",
      ),
    ],
    chart,
    rankings: {
      title: "Bairros com mais locações",
      items: neighborhoods,
      emptyTitle: "Sem bairros de locação no período.",
    },
    insights: buildAreaInsights({
      area: "alugueis",
      delta,
      title: "Aluguéis",
      topItem: neighborhoods[0],
      topDescription: "teve o maior volume de locações no recorte.",
    }),
    state: resolveAreaState(
      "alugueis",
      chartHasData(chart),
      sourceStates,
      "Nenhum dado de aluguéis disponível.",
      "Ajuste o período ou conecte contratos de locação para visualizar desempenho.",
    ),
  };
}

function buildVendasArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildSingleMetricChart({
    id: "vendas-evolucao",
    title: "Valor vendido",
    subtitle: "Valor total das vendas registradas no período.",
    range,
    items: scoped.sales.map((item) => ({
      date: parseDate(item.saleDate) ?? parseDate(item.createdAt),
      value: item.saleStatus === "cancelada" ? 0 : item.saleValue,
    })),
    dataKey: "valor",
    seriesLabel: "Valor vendido",
    color: chartSystem,
    kind: "bar",
    valueKind: "currency",
    emptyTitle: "Nenhuma venda registrada no período.",
    emptyDescription: "Vendas registradas com data válida alimentarão este gráfico.",
  });
  const agentRanking = rankByText(
    current.sales,
    (item) => item.responsibleAgent,
    (name, count, max, items) => ({
      id: `vd-corretor-${normalizeKey(name)}`,
      name,
      subtitle: "responsável por vendas",
      value: formatCount(count, "venda"),
      secondaryValue: brl(
        sum(items, (item) => item.saleValue),
        { compact: true },
      ),
      progress: getProgress(count, max),
    }),
  );
  const ticket = current.sales.length ? current.soldValue / current.sales.length : 0;
  const attached = countBy(current.sales, (item) =>
    Boolean(item.contractFilePath || item.contractFileName),
  );
  const delta = previous
    ? buildDelta(current.closedSalesCount, previous.closedSalesCount)
    : undefined;

  return {
    id: "vendas",
    title: "Vendas",
    subtitle: "Valor vendido, contratos anexados, ticket médio e desempenho por responsável.",
    metricLabel: "Vendas fechadas",
    metricValue: formatNumber(current.closedSalesCount),
    metricDetail: `${brl(current.soldValue, { compact: true })} vendidos no recorte`,
    delta,
    highlights: [
      highlight("vd-ticket", "Ticket médio", ticket, "positive", "currency"),
      highlight("vd-contratos", "Contratos anexados", attached),
      highlight(
        "vd-pendencias",
        "Pendências documentais",
        countBy(current.sales, (item) => item.documentStatus !== "contrato_anexado"),
        "attention",
      ),
    ],
    chart,
    rankings: {
      title: "Ranking de vendas",
      items: agentRanking,
      emptyTitle: "Sem responsáveis para ranquear.",
    },
    insights: buildAreaInsights({
      area: "vendas",
      delta,
      title: "Vendas",
      topItem: agentRanking[0],
      topDescription: "aparece com maior participação nas vendas registradas.",
    }),
    state: resolveAreaState(
      "vendas",
      chartHasData(chart),
      sourceStates,
      "Nenhuma venda disponível.",
      "Ajuste o período ou registre vendas para visualizar a análise comercial.",
    ),
  };
}

function buildFinanceiroArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildMultiMetricChart({
    id: "financeiro-fluxo",
    title: "Receita, despesa e saldo",
    subtitle: "Movimento financeiro registrado por período.",
    range,
    series: [
      {
        key: "receita",
        label: "Receita",
        color: chartSuccess,
        valueKind: "currency",
        chartType: "bar",
      },
      {
        key: "despesa",
        label: "Despesa",
        color: chartMorar,
        valueKind: "currency",
        chartType: "bar",
      },
      {
        key: "saldo",
        label: "Saldo",
        color: chartSystem,
        valueKind: "currency",
        chartType: "line",
      },
    ],
    entries: scoped.lancamentos.map((item) => ({
      date: parseDate(item.data),
      values: {
        receita: item.tipo === "entrada" ? item.valor : 0,
        despesa: item.tipo === "saida" ? item.valor : 0,
        saldo: item.tipo === "entrada" ? item.valor : -item.valor,
      },
    })),
    kind: "composed",
    emptyTitle: "Nenhum lançamento financeiro no período.",
    emptyDescription: "Receitas e despesas registradas no financeiro alimentarão esta visão.",
  });
  const categoryRanking = rankByText(
    current.lancamentos,
    (item) => item.categoria,
    (name, count, max, items) => ({
      id: `fin-cat-${normalizeKey(name)}`,
      name,
      subtitle: "categoria financeira",
      value: brl(
        sum(items, (item) => item.valor),
        { compact: true },
      ),
      secondaryValue: formatCount(count, "lançamento"),
      progress: getProgress(count, max),
    }),
  );
  const overdue = sum(
    current.lancamentos.filter((item) => normalizeText(item.status).includes("atras")),
    (item) => item.valor,
  );
  const delta = previous ? buildDelta(current.financeRevenue, previous.financeRevenue) : undefined;

  return {
    id: "financeiro",
    title: "Financeiro",
    subtitle: "Entradas, saídas, saldo e categorias que mais movimentam o caixa.",
    metricLabel: "Saldo",
    metricValue: brl(current.financeBalance, { compact: true }),
    metricDetail: `${brl(current.financeRevenue, { compact: true })} de receita`,
    delta,
    highlights: [
      highlight("fin-receita", "Receita", current.financeRevenue, "positive", "currency"),
      highlight("fin-despesa", "Despesa", current.financeExpense, "warning", "currency"),
      highlight(
        "fin-atraso",
        "Atrasos",
        overdue,
        overdue > 0 ? "attention" : "neutral",
        "currency",
      ),
    ],
    chart,
    rankings: {
      title: "Maiores categorias",
      items: categoryRanking,
      emptyTitle: "Sem categorias no período.",
    },
    insights: buildAreaInsights({
      area: "financeiro",
      delta,
      title: "Receita financeira",
      topItem: categoryRanking[0],
      topDescription: "concentrou o maior movimento financeiro registrado.",
    }),
    state: resolveAreaState(
      "financeiro",
      chartHasData(chart),
      sourceStates,
      "Nenhum lançamento financeiro disponível.",
      "Ajuste o período ou registre entradas e saídas para visualizar saúde financeira.",
    ),
  };
}

function buildMarketingArea(
  scoped: ScopedReportData,
  current: PeriodFacts,
  previous: PeriodFacts | null,
  range: ReportsDateRange,
  sourceStates?: Partial<Record<ReportsAreaId, ReportsSourceState>>,
): ReportsAreaSummary {
  const chart = buildSingleMetricChart({
    id: "marketing-leads",
    title: "Tendência de leads",
    subtitle: "Leads gerados pelas campanhas com métrica diária disponível.",
    range,
    items: flattenMarketingDays(scoped.campaigns).map((item) => ({
      date: parseDate(item.date),
      value: item.leads,
    })),
    dataKey: "leads",
    seriesLabel: "Leads",
    color: chartAccent,
    kind: "area",
    valueKind: "number",
    emptyTitle: "Nenhum lead de marketing no período.",
    emptyDescription: "Campanhas com métricas diárias alimentarão a evolução de leads.",
  });
  const channelRanking = rankMarketingChannels(current.marketingDays);
  const bestCampaigns = rankMarketingCampaigns(current.marketingDays, current.campaigns);
  const cpl = current.marketingLeads ? current.marketingInvestment / current.marketingLeads : 0;
  const conversion = current.marketingClicks
    ? (current.marketingLeads / current.marketingClicks) * 100
    : 0;
  const delta = previous ? buildDelta(current.marketingLeads, previous.marketingLeads) : undefined;

  return {
    id: "marketing",
    title: "Marketing",
    subtitle: "Leads, investimento, canais eficientes e contribuição para demanda comercial.",
    metricLabel: "Leads gerados",
    metricValue: formatNumber(current.marketingLeads),
    metricDetail: `${brl(current.marketingInvestment, { compact: true })} investidos`,
    delta,
    highlights: [
      highlight("mk-cpl", "Custo por lead", cpl, cpl > 0 ? "info" : "neutral", "currency"),
      highlight("mk-cliques", "Cliques", current.marketingClicks),
      highlight("mk-conversao", "Conversão de clique", conversion, "positive", "percent"),
    ],
    chart,
    rankings: {
      title: "Canais com mais leads",
      items: channelRanking.length ? channelRanking : bestCampaigns,
      emptyTitle: "Sem canais para ranquear.",
    },
    insights: buildAreaInsights({
      area: "marketing",
      delta,
      title: "Marketing",
      topItem: channelRanking[0],
      topDescription: "foi o canal com mais leads no período.",
    }),
    state: resolveAreaState(
      "marketing",
      chartHasData(chart),
      sourceStates,
      "Nenhum dado de marketing disponível.",
      "Ajuste o período ou conecte campanhas para visualizar leads, cliques e custo.",
    ),
  };
}

function buildCrossAreaComparisons(
  scoped: ScopedReportData,
  range: ReportsDateRange,
): ReportsChartConfig[] {
  const marketingDays = flattenMarketingDays(scoped.campaigns);
  const funnelChart = buildMultiMetricChart({
    id: "comparativo-funil",
    title: "Funil integrado",
    subtitle: "Agenciamentos, atendimentos, clientes e leads no mesmo recorte.",
    range,
    kind: "line",
    series: [
      { key: "agenciamentos", label: "Agenciamentos", color: chartCordial, valueKind: "number" },
      { key: "atendimentos", label: "Atendimentos", color: chartSystem, valueKind: "number" },
      { key: "clientes", label: "Clientes", color: chartSuccess, valueKind: "number" },
      { key: "leads", label: "Leads", color: chartAccent, valueKind: "number" },
    ],
    entries: [
      ...scoped.agenciamentos.map((item) => ({
        date: parseDate(item.dataAgenciamento) ?? parseDate(item.criadoEm),
        values: { agenciamentos: 1 },
      })),
      ...scoped.atendimentos.map((item) => ({
        date: parseDate(item.criadoEm),
        values: { atendimentos: 1 },
      })),
      ...scoped.clients.map((item) => ({
        date: parseDate(item.createdAt),
        values: { clientes: 1 },
      })),
      ...marketingDays.map((item) => ({
        date: parseDate(item.date),
        values: { leads: item.leads },
      })),
    ],
    emptyTitle: "Sem dados para comparar o funil.",
    emptyDescription:
      "Quando as áreas registrarem dados, a relação entre demanda e operação aparecerá aqui.",
  });

  const dealChart = buildMultiMetricChart({
    id: "comparativo-negocios",
    title: "Aluguéis x vendas",
    subtitle: "Quantidade de negócios iniciados ou concluídos por período.",
    range,
    kind: "bar",
    series: [
      { key: "alugueis", label: "Aluguéis", color: chartMorar, valueKind: "number" },
      { key: "vendas", label: "Vendas", color: chartSystem, valueKind: "number" },
    ],
    entries: [
      ...scoped.rentals.map((item) => ({
        date: parseDate(item.dataInicio) ?? parseDate(item.createdAt),
        values: {
          alugueis: item.status === "cancelado" || item.status === "encerrado" ? 0 : 1,
        },
      })),
      ...scoped.sales.map((item) => ({
        date: parseDate(item.saleDate) ?? parseDate(item.createdAt),
        values: { vendas: item.saleStatus === "cancelada" ? 0 : 1 },
      })),
    ],
    emptyTitle: "Sem negócios para comparar.",
    emptyDescription: "Vendas e aluguéis registrados aparecerão lado a lado.",
  });

  const revenueChart = buildMultiMetricChart({
    id: "comparativo-receita",
    title: "Receita x negócios",
    subtitle: "Financeiro, valor vendido e valor mensal de locação no mesmo período.",
    range,
    kind: "composed",
    series: [
      {
        key: "receita",
        label: "Receita financeira",
        color: chartSuccess,
        valueKind: "currency",
        chartType: "bar",
      },
      {
        key: "vendas",
        label: "Valor vendido",
        color: chartSystem,
        valueKind: "currency",
        chartType: "line",
      },
      {
        key: "locacoes",
        label: "Valor de locações",
        color: chartMorar,
        valueKind: "currency",
        chartType: "line",
      },
    ],
    entries: [
      ...scoped.lancamentos.map((item) => ({
        date: parseDate(item.data),
        values: { receita: item.tipo === "entrada" ? item.valor : 0 },
      })),
      ...scoped.sales.map((item) => ({
        date: parseDate(item.saleDate) ?? parseDate(item.createdAt),
        values: { vendas: item.saleStatus === "cancelada" ? 0 : item.saleValue },
      })),
      ...scoped.rentals.map((item) => ({
        date: parseDate(item.dataInicio) ?? parseDate(item.createdAt),
        values: {
          locacoes:
            item.status === "cancelado" || item.status === "encerrado" ? 0 : item.valorMensal,
        },
      })),
    ],
    emptyTitle: "Sem dados financeiros ou comerciais.",
    emptyDescription: "Receitas, vendas e locações formarão esta leitura integrada.",
  });

  return [funnelChart, dealChart, revenueChart];
}

function buildGlobalInsights(
  current: PeriodFacts,
  previous: PeriodFacts | null,
  areas: ReportsAreaSummary[],
  rankings: ReportsRankingGroup[],
): ReportsInsightItem[] {
  const insights: ReportsInsightItem[] = [];

  areas.forEach((area) => {
    const insight = area.insights[0];
    if (insight && area.state.status === "ready") insights.push(insight);
  });

  if (current.closedRentalsCount > current.closedSalesCount && current.closedRentalsCount > 0) {
    insights.push({
      id: "rel-alugueis-superam-vendas",
      title: "Locação liderou em quantidade",
      description: `Aluguéis somaram ${formatNumber(current.closedRentalsCount)} fechamento(s), acima de ${formatNumber(current.closedSalesCount)} venda(s) no período.`,
      tone: "info",
      area: "alugueis",
      direction: "up",
    });
  }

  if (current.marketingLeads > 0 && current.clientsCount > 0) {
    const leadToClient = (current.clientsCount / current.marketingLeads) * 100;
    insights.push({
      id: "rel-marketing-clientes",
      title: "Marketing alimentou o funil",
      description: `${formatNumber(current.marketingLeads)} lead(s) e ${formatNumber(current.clientsCount)} novo(s) cliente(s) entraram no recorte, uma relação de ${formatPercent(leadToClient)}.`,
      tone: "positive",
      area: "marketing",
      direction: "up",
    });
  }

  if (current.financeExpense > current.financeRevenue && current.financeExpense > 0) {
    insights.push({
      id: "rel-despesa-acima-receita",
      title: "Saídas acima das entradas",
      description: `As despesas somaram ${brl(current.financeExpense, { compact: true })}, acima da receita financeira de ${brl(current.financeRevenue, { compact: true })}.`,
      tone: "attention",
      area: "financeiro",
      direction: "down",
    });
  } else if (
    previous &&
    current.financeRevenue > previous.financeRevenue &&
    current.financeRevenue > 0
  ) {
    insights.push({
      id: "rel-receita-em-alta",
      title: "Receita financeira em alta",
      description: `A receita subiu de ${brl(previous.financeRevenue, { compact: true })} para ${brl(current.financeRevenue, { compact: true })} no comparativo selecionado.`,
      tone: "positive",
      area: "financeiro",
      direction: "up",
    });
  }

  const topNeighborhood = rankings.find((group) => group.id === "bairros")?.items[0];
  if (topNeighborhood) {
    insights.push({
      id: "rel-bairro-destaque",
      title: "Bairro em destaque",
      description: `${topNeighborhood.name} concentrou o maior volume de movimentações entre captações, clientes, aluguéis e vendas.`,
      tone: "info",
      area: "geral",
      direction: "up",
    });
  }

  return uniqueById(insights).slice(0, 7);
}

function buildGlobalRankings(
  scoped: ScopedReportData,
  current: PeriodFacts,
): ReportsRankingGroup[] {
  return [
    {
      id: "corretores",
      title: "Ranking de corretores",
      subtitle: "Atendimentos, agenciamentos e vendas no período.",
      items: buildBrokerRanking(scoped, current),
      emptyTitle: "Sem corretores com movimentação no período.",
    },
    {
      id: "bairros",
      title: "Top bairros",
      subtitle: "Concentração de movimentações entre módulos.",
      items: buildNeighborhoodRanking(current),
      emptyTitle: "Sem bairros registrados no período.",
    },
    {
      id: "canais",
      title: "Top canais",
      subtitle: "Leads, origens de clientes e atendimentos.",
      items: buildChannelRanking(current),
      emptyTitle: "Sem canais ou origens no período.",
    },
    {
      id: "campanhas",
      title: "Top campanhas",
      subtitle: "Campanhas com maior entrega de leads.",
      items: rankMarketingCampaigns(current.marketingDays, current.campaigns),
      emptyTitle: "Sem campanhas com entrega no período.",
    },
  ];
}

function buildBrokerRanking(scoped: ScopedReportData, current: PeriodFacts): ReportsRankingItem[] {
  const brokers = new Map<string, { name: string; interactions: number; salesValue: number }>();

  scoped.corretores.forEach((corretor) => {
    brokers.set(corretor.id, { name: corretor.nome, interactions: 0, salesValue: 0 });
  });

  current.agenciamentos.forEach((item) => {
    addBrokerScore(brokers, item.corretorId, item.corretorNome, 1, 0);
  });
  current.atendimentos.forEach((item) => {
    addBrokerScore(brokers, item.corretorId, item.corretorNome, 1, 0);
  });
  current.sales.forEach((item) => {
    addBrokerScore(brokers, item.responsibleAgent, item.responsibleAgent, 1, item.saleValue);
  });

  const ranked = Array.from(brokers.entries())
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => item.interactions > 0 || item.salesValue > 0)
    .sort((a, b) => b.interactions - a.interactions || b.salesValue - a.salesValue)
    .slice(0, 5);
  const max = Math.max(...ranked.map((item) => item.interactions), 1);

  return ranked.map((item) => ({
    id: `broker-${normalizeKey(item.id)}`,
    name: item.name,
    subtitle: "movimentações no recorte",
    value: formatCount(item.interactions, "ação"),
    secondaryValue: item.salesValue > 0 ? brl(item.salesValue, { compact: true }) : undefined,
    progress: getProgress(item.interactions, max),
  }));
}

function buildNeighborhoodRanking(current: PeriodFacts): ReportsRankingItem[] {
  const entries = [
    ...current.agenciamentos.map((item) => item.bairro),
    ...current.clients.map((item) => item.neighborhood),
    ...current.closedRentals.map((item) => item.property.bairro),
    ...current.sales.map((item) => item.propertyNeighborhood),
  ];
  return rankTextEntries(entries, (name, count, max) => ({
    id: `bairro-${normalizeKey(name)}`,
    name,
    subtitle: "movimentações integradas",
    value: formatCount(count, "registro"),
    progress: getProgress(count, max),
  }));
}

function buildChannelRanking(current: PeriodFacts): ReportsRankingItem[] {
  const bucket = new Map<string, number>();

  current.marketingDays.forEach((item) => addMapValue(bucket, item.channel, item.leads));
  current.atendimentos.forEach((item) => addMapValue(bucket, leadOriginLabel(item.origem), 1));
  current.clients.forEach((item) => addMapValue(bucket, leadOriginLabel(item.leadOrigin), 1));

  const entries = Array.from(bucket.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = Math.max(...entries.map(([, value]) => value), 1);

  return entries.map(([name, value]) => ({
    id: `canal-${normalizeKey(name)}`,
    name,
    subtitle: "origem ou canal de demanda",
    value: formatCount(value, "entrada"),
    progress: getProgress(value, max),
  }));
}

function rankMarketingChannels(days: MarketingDay[]): ReportsRankingItem[] {
  const bucket = new Map<string, { leads: number; clicks: number }>();

  days.forEach((day) => {
    const current = bucket.get(day.channel) ?? { leads: 0, clicks: 0 };
    current.leads += day.leads;
    current.clicks += day.clicks;
    bucket.set(day.channel, current);
  });

  const entries = Array.from(bucket.entries())
    .filter(([, item]) => item.leads > 0)
    .sort((a, b) => b[1].leads - a[1].leads)
    .slice(0, 5);
  const max = Math.max(...entries.map(([, item]) => item.leads), 1);

  return entries.map(([name, item]) => ({
    id: `mk-channel-${normalizeKey(name)}`,
    name,
    subtitle: `${formatNumber(item.clicks)} clique(s) registrados`,
    value: formatCount(item.leads, "lead"),
    progress: getProgress(item.leads, max),
  }));
}

function rankMarketingCampaigns(
  days: MarketingDay[],
  campaigns: MarketingCampaign[],
): ReportsRankingItem[] {
  const bucket = new Map<string, { name: string; leads: number; investment: number }>();

  campaigns.forEach((campaign) => {
    bucket.set(campaign.id, {
      name: campaign.name,
      leads: 0,
      investment: campaign.investment,
    });
  });

  days.forEach((day) => {
    const current = bucket.get(day.campaignId) ?? {
      name: day.campaignName,
      leads: 0,
      investment: day.investment,
    };
    current.leads += day.leads;
    bucket.set(day.campaignId, current);
  });

  const entries = Array.from(bucket.entries())
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => item.leads > 0)
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5);
  const max = Math.max(...entries.map((item) => item.leads), 1);

  return entries.map((item) => ({
    id: `campanha-${normalizeKey(item.id)}`,
    name: item.name,
    subtitle:
      item.investment > 0 && item.leads > 0
        ? `${brl(item.investment / item.leads, { compact: true })} por lead`
        : "entrega orgânica ou sem investimento",
    value: formatCount(item.leads, "lead"),
    progress: getProgress(item.leads, max),
  }));
}

function buildPeriodFacts(scoped: ScopedReportData, range: ReportsDateRange): PeriodFacts {
  const agenciamentos = scoped.agenciamentos.filter((item) =>
    isInRange(parseDate(item.dataAgenciamento) ?? parseDate(item.criadoEm), range),
  );
  const atendimentos = scoped.atendimentos.filter((item) =>
    isInRange(parseDate(item.criadoEm), range),
  );
  const clients = scoped.clients.filter((item) => isInRange(parseDate(item.createdAt), range));
  const rentals = scoped.rentals.filter((item) =>
    isInRange(parseDate(item.dataInicio) ?? parseDate(item.createdAt), range),
  );
  const closedRentals = rentals.filter(
    (item) => item.status !== "cancelado" && item.status !== "encerrado",
  );
  const sales = scoped.sales.filter((item) =>
    isInRange(parseDate(item.saleDate) ?? parseDate(item.createdAt), range),
  );
  const validSales = sales.filter((item) => item.saleStatus !== "cancelada");
  const closedSales = validSales.filter((item) => item.saleStatus === "concluida");
  const lancamentos = scoped.lancamentos.filter((item) => isInRange(parseDate(item.data), range));
  const campaigns = scoped.campaigns.filter((campaign) => campaignIntersectsRange(campaign, range));
  const marketingDays = flattenMarketingDays(scoped.campaigns).filter((item) =>
    isInRange(parseDate(item.date), range),
  );
  const financeRevenue = sum(
    lancamentos.filter((item) => item.tipo === "entrada"),
    (item) => item.valor,
  );
  const financeExpense = sum(
    lancamentos.filter((item) => item.tipo === "saida"),
    (item) => item.valor,
  );
  const rentalValue = sum(closedRentals, (item) => item.valorMensal);
  const soldValue = sum(validSales, (item) => item.saleValue);
  const marketingLeads = sum(marketingDays, (item) => item.leads);
  const marketingClicks = sum(marketingDays, (item) => item.clicks);
  const marketingViews = sum(marketingDays, (item) => item.views);
  const marketingInvestment = sum(campaigns, (item) => item.investment);
  const opportunityBase = marketingLeads + atendimentos.length + clients.length;
  const closedOutcome = closedSales.length + closedRentals.length;
  const overallConversion = opportunityBase > 0 ? (closedOutcome / opportunityBase) * 100 : 0;

  return {
    agenciamentos,
    atendimentos,
    clients,
    rentals,
    closedRentals,
    sales: validSales,
    closedSales,
    lancamentos,
    marketingDays,
    campaigns,
    agenciamentosCount: agenciamentos.length,
    atendimentosCount: atendimentos.length,
    clientsCount: clients.length,
    closedRentalsCount: closedRentals.length,
    closedSalesCount: closedSales.length,
    rentalValue,
    soldValue,
    financeRevenue,
    financeExpense,
    financeBalance: financeRevenue - financeExpense,
    marketingLeads,
    marketingClicks,
    marketingViews,
    marketingInvestment,
    overallConversion,
  };
}

function scopeDataByAgency(input: ReportsDataInput): ScopedReportData {
  const agency = input.agency;
  return {
    agenciamentos: input.agenciamentos.filter((item) => agencyMatches(item.imobiliaria, agency)),
    atendimentos: input.atendimentos.filter((item) => agencyMatches(item.imobiliaria, agency)),
    clients: input.clients.filter((item) => agencyMatches(item.brand, agency)),
    rentals: input.rentals.filter((item) => agencyMatches(item.brand, agency)),
    sales: input.sales.filter((item) => agencyMatches(item.imobiliaria, agency)),
    lancamentos: input.lancamentos.filter((item) => agencyMatches(item.imobiliaria, agency)),
    campaigns: input.campaigns.filter((item) => agencyMatches(item.imobiliaria, agency)),
    corretores: input.corretores.filter((item) => agencyMatches(item.imobiliaria, agency)),
  };
}

function buildSingleMetricChart({
  id,
  title,
  subtitle,
  range,
  items,
  dataKey,
  seriesLabel,
  color,
  kind,
  valueKind,
  emptyTitle,
  emptyDescription,
}: {
  id: string;
  title: string;
  subtitle: string;
  range: ReportsDateRange;
  items: Array<{ date: Date | null; value: number }>;
  dataKey: string;
  seriesLabel: string;
  color: string;
  kind: "bar" | "line" | "area";
  valueKind: ReportsValueKind;
  emptyTitle: string;
  emptyDescription: string;
}): ReportsChartConfig {
  return buildMultiMetricChart({
    id,
    title,
    subtitle,
    range,
    entries: items.map((item) => ({ date: item.date, values: { [dataKey]: item.value } })),
    series: [{ key: dataKey, label: seriesLabel, color, valueKind }],
    kind,
    emptyTitle,
    emptyDescription,
  });
}

function buildMultiMetricChart({
  id,
  title,
  subtitle,
  range,
  entries,
  series,
  kind,
  emptyTitle,
  emptyDescription,
}: {
  id: string;
  title: string;
  subtitle: string;
  range: ReportsDateRange;
  entries: Array<{ date: Date | null; values: Record<string, number> }>;
  series: ReportsChartConfig["series"];
  kind: ReportsChartConfig["kind"];
  emptyTitle: string;
  emptyDescription: string;
}): ReportsChartConfig {
  const fields = series.map((item) => item.key);
  const buckets = createBuckets(range, fields);

  entries.forEach((entry) => {
    if (!entry.date || !isInRange(entry.date, range)) return;
    const bucket = buckets.find(
      (item) => entry.date && entry.date >= item.start && entry.date <= item.end,
    );
    if (!bucket) return;

    fields.forEach((field) => {
      bucket.values[field] += entry.values[field] ?? 0;
    });
  });

  return {
    id,
    title,
    subtitle,
    kind,
    data: buckets.map((bucket) => {
      const point: ReportsChartPoint = {
        key: bucket.key,
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
      };
      fields.forEach((field) => {
        point[field] = Math.round((bucket.values[field] + Number.EPSILON) * 100) / 100;
      });
      return point;
    }),
    series,
    emptyTitle,
    emptyDescription,
  };
}

function createBuckets(range: ReportsDateRange, fields: string[]): MutableBucket[] {
  const granularity = getGranularity(range);
  if (granularity === "month") return createMonthBuckets(range, fields);
  if (granularity === "week") return createWeekBuckets(range, fields);
  return createDayBuckets(range, fields);
}

function createDayBuckets(range: ReportsDateRange, fields: string[]): MutableBucket[] {
  const buckets: MutableBucket[] = [];
  let cursor = startOfDay(range.start);
  while (cursor <= range.end) {
    const start = startOfDay(cursor);
    const end = minDate(endOfDay(cursor), range.end);
    buckets.push(createBucket(start, end, formatDayLabel(start), formatFullDate(start), fields));
    cursor = addDays(cursor, 1);
  }
  return buckets;
}

function createWeekBuckets(range: ReportsDateRange, fields: string[]): MutableBucket[] {
  const buckets: MutableBucket[] = [];
  let cursor = startOfDay(range.start);
  while (cursor <= range.end) {
    const start = startOfDay(cursor);
    const end = minDate(endOfDay(addDays(start, 6)), range.end);
    buckets.push(
      createBucket(
        start,
        end,
        `${formatShortDay(start)}-${formatShortDay(end)}`,
        formatRangeLabel(start, end),
        fields,
      ),
    );
    cursor = addDays(start, 7);
  }
  return buckets;
}

function createMonthBuckets(range: ReportsDateRange, fields: string[]): MutableBucket[] {
  const buckets: MutableBucket[] = [];
  let cursor = startOfMonth(range.start);
  while (cursor <= range.end) {
    const start = maxDate(startOfMonth(cursor), range.start);
    const end = minDate(endOfMonth(cursor), range.end);
    buckets.push(createBucket(start, end, formatMonthShort(start), formatMonthLong(start), fields));
    cursor = addMonths(cursor, 1);
  }
  return buckets;
}

function createBucket(
  start: Date,
  end: Date,
  label: string,
  tooltipLabel: string,
  fields: string[],
): MutableBucket {
  return {
    key: `${toInputDate(start)}-${toInputDate(end)}`,
    label,
    tooltipLabel,
    start,
    end,
    values: fields.reduce<Record<string, number>>((acc, field) => {
      acc[field] = 0;
      return acc;
    }, {}),
  };
}

function getGranularity(range: ReportsDateRange) {
  const days = differenceInDays(range.start, range.end) + 1;
  if (days <= 10) return "day";
  if (days <= 90) return "week";
  return "month";
}

function getReportPeriod(
  preset: ReportsPeriodPreset,
  customStart: string | undefined,
  customEnd: string | undefined,
  today: Date,
) {
  const endToday = endOfDay(today);

  if (preset === "today") {
    const range = { start: startOfDay(today), end: endToday };
    return { range, label: "Hoje" };
  }

  if (preset === "this_week") {
    const range = { start: startOfWeek(today), end: endToday };
    return { range, label: "Esta semana" };
  }

  if (preset === "last_7_days") {
    const range = { start: startOfDay(addDays(today, -6)), end: endToday };
    return { range, label: "Últimos 7 dias" };
  }

  if (preset === "this_month") {
    const range = { start: startOfMonth(today), end: endToday };
    return { range, label: "Este mês" };
  }

  if (preset === "last_30_days") {
    const range = { start: startOfDay(addDays(today, -29)), end: endToday };
    return { range, label: "Últimos 30 dias" };
  }

  const fallback = getDefaultReportsCustomRange(today);
  const start = parseInputDate(customStart || fallback.start) ?? startOfMonth(today);
  const end = parseInputDate(customEnd || fallback.end) ?? today;
  const range = {
    start: startOfDay(minDate(start, end)),
    end: endOfDay(maxDate(start, end)),
  };
  return { range, label: formatRangeLabel(range.start, range.end) };
}

function getComparisonPeriod(mode: ReportsComparisonMode, range: ReportsDateRange) {
  if (mode === "none") {
    return { mode, label: "Sem comparação", range: null };
  }

  if (mode === "previous_month") {
    const reference = addMonths(startOfMonth(range.end), -1);
    const previousRange = {
      start: startOfMonth(reference),
      end: endOfMonth(reference),
    };
    return { mode, label: "Comparado ao mês anterior", range: previousRange };
  }

  if (mode === "previous_week") {
    const previousStart = addDays(startOfWeek(range.start), -7);
    const previousRange = {
      start: previousStart,
      end: endOfDay(addDays(previousStart, 6)),
    };
    return { mode, label: "Comparado à semana anterior", range: previousRange };
  }

  const days = differenceInDays(range.start, range.end) + 1;
  const previousRange = {
    start: startOfDay(addDays(range.start, -days)),
    end: endOfDay(addDays(range.start, -1)),
  };
  return { mode, label: "Comparado ao período anterior", range: previousRange };
}

function buildKpi({
  id,
  label,
  value,
  previousValue,
  helper,
  area,
  valueKind,
  tone,
}: {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  helper: string;
  area: ReportsKpi["area"];
  valueKind: ReportsValueKind;
  tone?: ReportsTone;
}): ReportsKpi {
  return {
    id,
    label,
    value,
    formattedValue: formatValue(value, valueKind),
    helper,
    area,
    valueKind,
    delta: typeof previousValue === "number" ? buildDelta(value, previousValue) : undefined,
    tone,
  };
}

function buildDelta(current: number, previous: number, higherIsBetter = true): ReportsDelta {
  const absolute = current - previous;
  const direction = absolute > 0 ? "up" : absolute < 0 ? "down" : "flat";
  const percent = previous !== 0 ? (absolute / Math.abs(previous)) * 100 : current !== 0 ? null : 0;
  const sign = absolute > 0 ? "+" : "";
  const label =
    percent === null
      ? current > 0
        ? "novo volume"
        : "sem base"
      : `${sign}${Math.round(percent)}%`;
  const positiveDirection = higherIsBetter ? "up" : "down";
  const negativeDirection = higherIsBetter ? "down" : "up";
  const tone =
    direction === positiveDirection
      ? "positive"
      : direction === negativeDirection
        ? "attention"
        : "neutral";

  return {
    current,
    previous,
    absolute,
    percent,
    direction,
    label,
    tone,
  };
}

function buildPointDelta(current: number, previous: number): ReportsDelta {
  const absolute = current - previous;
  const direction = absolute > 0 ? "up" : absolute < 0 ? "down" : "flat";
  const label = `${absolute > 0 ? "+" : ""}${Math.round(absolute)} p.p.`;
  return {
    current,
    previous,
    absolute,
    percent: null,
    direction,
    label,
    tone: direction === "up" ? "positive" : direction === "down" ? "attention" : "neutral",
  };
}

function buildAreaInsights({
  area,
  delta,
  title,
  topItem,
  topDescription,
}: {
  area: ReportsAreaId;
  delta?: ReportsDelta;
  title: string;
  topItem?: ReportsRankingItem;
  topDescription: string;
}): ReportsInsightItem[] {
  const insights: ReportsInsightItem[] = [];

  if (delta && delta.direction !== "flat") {
    const isUp = delta.direction === "up";
    insights.push({
      id: `${area}-delta-${delta.direction}`,
      title: `${title} ${isUp ? "em alta" : "em queda"}`,
      description:
        delta.percent === null
          ? `${title} registrou novo volume sem base anterior para comparação.`
          : `${title} ${isUp ? "cresceu" : "caiu"} ${Math.abs(Math.round(delta.percent))}% frente ao comparativo selecionado.`,
      tone: isUp ? "positive" : "attention",
      area,
      direction: delta.direction,
    });
  }

  if (topItem) {
    insights.push({
      id: `${area}-top-${topItem.id}`,
      title: `${topItem.name} em destaque`,
      description: `${topItem.name} ${topDescription}`,
      tone: "info",
      area,
      direction: "up",
    });
  }

  return insights;
}

function resolveAreaState(
  area: ReportsAreaId,
  hasData: boolean,
  sourceStates: Partial<Record<ReportsAreaId, ReportsSourceState>> | undefined,
  emptyTitle: string,
  emptyDescription: string,
): ReportsSourceState {
  const sourceState = sourceStates?.[area];

  if (sourceState && sourceState.status !== "ready" && sourceState.status !== "empty") {
    return sourceState;
  }

  if (hasData) return { status: "ready" };

  return {
    status: "empty",
    title: sourceState?.title ?? emptyTitle,
    description: sourceState?.description ?? emptyDescription,
  };
}

function chartHasData(chart: ReportsChartConfig) {
  return chart.data.some((point) =>
    chart.series.some((series) => Math.abs(Number(point[series.key] ?? 0)) > 0),
  );
}

function highlight(
  id: string,
  label: string,
  value: number,
  tone: ReportsTone = "neutral",
  valueKind: ReportsValueKind = "number",
) {
  return {
    id,
    label,
    value: formatValue(value, valueKind),
    tone,
  };
}

function rankByText<T>(
  items: T[],
  getText: (item: T) => string | null | undefined,
  createItem: (name: string, count: number, max: number, items: T[]) => ReportsRankingItem,
) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const text = normalizeDisplayText(getText(item));
    if (!text) return;
    const group = grouped.get(text) ?? [];
    group.push(item);
    grouped.set(text, group);
  });

  const entries = Array.from(grouped.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);
  const max = Math.max(...entries.map(([, group]) => group.length), 1);

  return entries.map(([name, group]) => createItem(name, group.length, max, group));
}

function rankTextEntries(
  items: Array<string | null | undefined>,
  createItem: (name: string, count: number, max: number) => ReportsRankingItem,
) {
  const grouped = new Map<string, number>();
  items.forEach((value) => {
    const text = normalizeDisplayText(value);
    if (!text) return;
    grouped.set(text, (grouped.get(text) ?? 0) + 1);
  });

  const entries = Array.from(grouped.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  return entries.map(([name, count]) => createItem(name, count, max));
}

function flattenMarketingDays(campaigns: MarketingCampaign[]): MarketingDay[] {
  return campaigns.flatMap((campaign) =>
    campaign.dailyMetrics.map((day) => ({
      ...day,
      campaignId: campaign.id,
      campaignName: campaign.name,
      channel: campaign.channel,
      investment: campaign.investment,
    })),
  );
}

function campaignIntersectsRange(campaign: MarketingCampaign, range: ReportsDateRange) {
  const start = parseDate(campaign.startDate);
  const end = parseDate(campaign.endDate);
  if (!start && !end) return false;
  const campaignStart = start ?? end;
  const campaignEnd = end ?? start;
  if (!campaignStart || !campaignEnd) return false;
  return campaignStart <= range.end && campaignEnd >= range.start;
}

function addBrokerScore(
  brokers: Map<string, { name: string; interactions: number; salesValue: number }>,
  id: string | undefined,
  name: string | undefined,
  interactions: number,
  salesValue: number,
) {
  const finalName = normalizeDisplayText(name);
  if (!finalName) return;
  const key = id || finalName;
  const current = brokers.get(key) ?? { name: finalName, interactions: 0, salesValue: 0 };
  current.interactions += interactions;
  current.salesValue += salesValue;
  brokers.set(key, current);
}

function addMapValue(map: Map<string, number>, key: string | undefined, value: number) {
  const finalKey = normalizeDisplayText(key);
  if (!finalKey || value <= 0) return;
  map.set(finalKey, (map.get(finalKey) ?? 0) + value);
}

function agencyMatches(value: string | undefined, agency: AgencyFilter) {
  if (agency === "todas") return true;
  return value === agency || value === "ambas";
}

function countBy<T>(items: T[], predicate: (item: T) => boolean) {
  return items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
}

function sum<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function formatValue(value: number, kind: ReportsValueKind) {
  if (kind === "currency") return brl(value, { compact: true });
  if (kind === "percent") return formatPercent(value);
  return formatNumber(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value)}%`;
}

function formatCount(value: number, singular: string) {
  return `${formatNumber(value)} ${singular}${value === 1 ? "" : "s"}`;
}

function getProgress(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(6, Math.min(100, Math.round((value / max) * 100)));
}

function normalizeDisplayText(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  return text;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeKey(value: string) {
  return (
    normalizeText(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "item"
  );
}

function uniqueById(items: ReportsInsightItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInputDate(value: string | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInRange(date: Date | null, range: ReportsDateRange) {
  return Boolean(date && date >= range.start && date <= range.end);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(start, diff);
}

function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function minDate(first: Date, second: Date) {
  return first <= second ? first : second;
}

function maxDate(first: Date, second: Date) {
  return first >= second ? first : second;
}

function differenceInDays(start: Date, end: Date) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / MS_DAY);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatShortDay(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRangeLabel(start: Date, end: Date) {
  return `${formatFullDate(start)} a ${formatFullDate(end)}`;
}

function formatMonthShort(date: Date) {
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${capitalize(month)}/${String(date.getFullYear()).slice(2)}`;
}

function formatMonthLong(date: Date) {
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${capitalize(month)} de ${date.getFullYear()}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function atendimentoStatusLabel(value: string) {
  const labels: Record<string, string> = {
    novo: "Novo",
    em_atendimento: "Em atendimento",
    aguardando_retorno: "Aguardando retorno",
    visita_agendada: "Visita agendada",
    proposta_enviada: "Proposta enviada",
    negociacao: "Negociação",
    fechado: "Fechado",
    perdido: "Perdido",
    sem_retorno: "Sem retorno",
    arquivado: "Arquivado",
  };
  return labels[value] ?? labelFromKey(value);
}

function leadOriginLabel(value: string) {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    indicacao: "Indicação",
    site: "Site",
    portal: "Portal imobiliário",
    presencial: "Atendimento presencial",
    porta_fria: "Porta fria",
    outro: "Outro",
  };
  return labels[value] ?? labelFromKey(value);
}

function labelFromKey(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
