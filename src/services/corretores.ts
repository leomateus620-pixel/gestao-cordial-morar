import type {
  Corretor,
  CorretorDashboardChartItem,
  CorretorFiltersState,
  CorretorImobiliaria,
  CorretorPeriodFilter,
  CorretorSortKey,
  CorretorStatusFilter,
  CorretoresSummary,
} from "@/types/corretor";

export type AgencyFilter = "todas" | Exclude<CorretorImobiliaria, "ambas">;

type LegacyCorretor = Partial<Corretor> & {
  id: string;
  nome: string;
  iniciais: string;
  creci: string;
  imobiliaria?: CorretorImobiliaria;
};

const DEFAULT_FILTERS: CorretorFiltersState = {
  periodo: "mes",
  status: "ativos",
  ordenacao: "contratos",
  busca: "",
};

const sortAccessors: Record<CorretorSortKey, (corretor: Corretor) => number> = {
  conversao: (corretor) => corretor.taxaConversao,
  contratos: (corretor) => corretor.contratosFechados,
  atendimentos: (corretor) => corretor.atendimentosRecebidos,
  comissao: (corretor) => corretor.comissaoPrevista,
  agenciamentos: (corretor) => corretor.agenciamentosFeitos,
};

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAgency(value: unknown): CorretorImobiliaria {
  return value === "morar" || value === "ambas" ? value : "cordial";
}

export function normalizeCorretor(input: LegacyCorretor): Corretor {
  const atendimentosRecebidos = asNumber(input.atendimentosRecebidos, input.atendimentosMes ?? 0);
  const contratosFechados = asNumber(input.contratosFechados);
  const vendasFechadas = asNumber(
    input.vendasFechadas,
    contratosFechados > 0 ? Math.max(1, Math.round(contratosFechados * 0.42)) : 0,
  );
  const alugueisFechados = asNumber(
    input.alugueisFechados,
    Math.max(contratosFechados - vendasFechadas, 0),
  );
  const agenciamentosFeitos = asNumber(input.agenciamentosFeitos);
  const agenciamentosComFotos = asNumber(input.agenciamentosComFotos, agenciamentosFeitos);
  const comissaoPrevista = asNumber(input.comissaoPrevista, input.comissaoMes ?? 0);
  const comissaoPaga = asNumber(input.comissaoPaga, Math.round(comissaoPrevista * 0.72));
  const taxaConversao = asNumber(
    input.taxaConversao,
    atendimentosRecebidos > 0 ? Math.round((contratosFechados / atendimentosRecebidos) * 100) : 0,
  );

  return {
    id: input.id,
    nome: input.nome,
    iniciais: input.iniciais,
    imobiliaria: normalizeAgency(input.imobiliaria),
    creci: input.creci,
    status: input.status ?? "ativo",
    atendimentosMes: asNumber(input.atendimentosMes, atendimentosRecebidos),
    atendimentosRecebidos,
    atendimentosEmAndamento: asNumber(
      input.atendimentosEmAndamento,
      Math.max(atendimentosRecebidos - contratosFechados - 3, 0),
    ),
    visitasRealizadas: asNumber(input.visitasRealizadas),
    propostasFeitas: asNumber(input.propostasFeitas, Math.max(contratosFechados + 2, 0)),
    contratosFechados,
    vendasFechadas,
    alugueisFechados,
    agenciamentosFeitos,
    agenciamentosComPlaca: asNumber(
      input.agenciamentosComPlaca,
      Math.min(agenciamentosFeitos, Math.round(agenciamentosFeitos * 0.65)),
    ),
    agenciamentosComFotos,
    agenciamentosNoSite: asNumber(
      input.agenciamentosNoSite,
      Math.min(agenciamentosComFotos, Math.round(agenciamentosFeitos * 0.72)),
    ),
    agenciamentosValidados: asNumber(
      input.agenciamentosValidados,
      Math.min(agenciamentosFeitos, Math.round(agenciamentosFeitos * 0.5)),
    ),
    comissaoPrevista,
    comissaoPaga,
    comissaoMes: asNumber(input.comissaoMes, comissaoPrevista),
    taxaConversao: clamp(taxaConversao),
    mediaMensalContratos: asNumber(input.mediaMensalContratos, contratosFechados),
    ticketMedio: asNumber(
      input.ticketMedio,
      contratosFechados > 0 ? Math.round(comissaoPrevista / contratosFechados) : 0,
    ),
    rankingPosicao: input.rankingPosicao,
    performanceTrend: input.performanceTrend ?? "estavel",
    ultimoAtendimentoEm: input.ultimoAtendimentoEm,
    observacaoGestao: input.observacaoGestao,
  };
}

export function normalizeCorretores(corretores: LegacyCorretor[]) {
  return corretores.map(normalizeCorretor);
}

export function getCorretorAgencyLabel(imobiliaria: CorretorImobiliaria) {
  if (imobiliaria === "cordial") return "Cordial";
  if (imobiliaria === "morar") return "Morar";
  return "Cordial + Morar";
}

export function getCorretorPeriodLabel(periodo: CorretorPeriodFilter) {
  const labels: Record<CorretorPeriodFilter, string> = {
    mes: "Este mês",
    ultimos_30: "Últimos 30 dias",
    trimestre: "Trimestre",
    ano: "Ano",
  };
  return labels[periodo];
}

export function getCorretorStatusLabel(status: CorretorStatusFilter) {
  const labels: Record<CorretorStatusFilter, string> = {
    ativos: "Ativos",
    inativos: "Inativos",
    todos: "Todos",
  };
  return labels[status];
}

export function getAgenciamentoCompletion(corretor: Corretor) {
  if (corretor.agenciamentosFeitos <= 0) return 0;
  const totalSteps =
    corretor.agenciamentosComPlaca +
    corretor.agenciamentosComFotos +
    corretor.agenciamentosNoSite +
    corretor.agenciamentosValidados;
  return clamp(Math.round((totalSteps / (corretor.agenciamentosFeitos * 4)) * 100));
}

export function filterCorretoresByAgency(corretores: Corretor[], agency: AgencyFilter) {
  if (agency === "todas") return corretores;
  return corretores.filter(
    (corretor) => corretor.imobiliaria === agency || corretor.imobiliaria === "ambas",
  );
}

export function sortCorretores(corretores: Corretor[], ordenacao: CorretorSortKey) {
  const accessor = sortAccessors[ordenacao];
  return [...corretores].sort((a, b) => {
    const primary = accessor(b) - accessor(a);
    if (primary !== 0) return primary;
    const contracts = b.contratosFechados - a.contratosFechados;
    if (contracts !== 0) return contracts;
    return b.comissaoPrevista - a.comissaoPrevista;
  });
}

export function filterCorretores(
  corretores: Corretor[],
  agency: AgencyFilter,
  filters: Partial<CorretorFiltersState> = DEFAULT_FILTERS,
) {
  const nextFilters = { ...DEFAULT_FILTERS, ...filters };
  const query = nextFilters.busca.trim().toLowerCase();

  const filtered = filterCorretoresByAgency(corretores, agency).filter((corretor) => {
    const matchesStatus =
      nextFilters.status === "todos" ||
      (nextFilters.status === "ativos" && corretor.status === "ativo") ||
      (nextFilters.status === "inativos" && corretor.status === "inativo");
    const matchesQuery =
      !query ||
      corretor.nome.toLowerCase().includes(query) ||
      corretor.creci.toLowerCase().includes(query);

    return matchesStatus && matchesQuery;
  });

  return sortCorretores(filtered, nextFilters.ordenacao);
}

export function rankCorretores(corretores: Corretor[]) {
  return sortCorretores(corretores, "contratos").map((corretor, index) => ({
    ...corretor,
    rankingPosicao: index + 1,
  }));
}

export function calculateCorretoresSummary(corretores: Corretor[]): CorretoresSummary {
  const total = corretores.length;
  const summary = corretores.reduce(
    (acc, corretor) => {
      acc.ativos += corretor.status === "ativo" ? 1 : 0;
      acc.atendimentosRecebidos += corretor.atendimentosRecebidos;
      acc.atendimentosEmAndamento += corretor.atendimentosEmAndamento;
      acc.visitasRealizadas += corretor.visitasRealizadas;
      acc.propostasFeitas += corretor.propostasFeitas;
      acc.contratosFechados += corretor.contratosFechados;
      acc.vendasFechadas += corretor.vendasFechadas;
      acc.alugueisFechados += corretor.alugueisFechados;
      acc.agenciamentosFeitos += corretor.agenciamentosFeitos;
      acc.comissaoPrevista += corretor.comissaoPrevista;
      acc.comissaoPaga += corretor.comissaoPaga;
      acc.ticketMedio += corretor.ticketMedio;
      acc.agenciamentosChecklistPercent += getAgenciamentoCompletion(corretor);
      return acc;
    },
    {
      total,
      ativos: 0,
      atendimentosRecebidos: 0,
      atendimentosEmAndamento: 0,
      visitasRealizadas: 0,
      propostasFeitas: 0,
      contratosFechados: 0,
      vendasFechadas: 0,
      alugueisFechados: 0,
      agenciamentosFeitos: 0,
      agenciamentosChecklistPercent: 0,
      comissaoPrevista: 0,
      comissaoPaga: 0,
      comissaoPendente: 0,
      taxaMediaConversao: 0,
      ticketMedio: 0,
    },
  );

  summary.taxaMediaConversao =
    summary.atendimentosRecebidos > 0
      ? Math.round((summary.contratosFechados / summary.atendimentosRecebidos) * 100)
      : 0;
  summary.agenciamentosChecklistPercent =
    total > 0 ? Math.round(summary.agenciamentosChecklistPercent / total) : 0;
  summary.ticketMedio = total > 0 ? Math.round(summary.ticketMedio / total) : 0;
  summary.comissaoPendente = Math.max(summary.comissaoPrevista - summary.comissaoPaga, 0);

  return summary;
}

export function getCorretoresDashboardChart(corretores: Corretor[]): CorretorDashboardChartItem[] {
  return rankCorretores(corretores)
    .slice(0, 5)
    .map((corretor) => ({
      nome: corretor.nome.split(" ")[0],
      imobiliaria: corretor.imobiliaria,
      atendimentos: corretor.atendimentosRecebidos,
      contratos: corretor.contratosFechados,
      conversao: corretor.taxaConversao,
    }));
}

export function getDefaultCorretorFilters(): CorretorFiltersState {
  return { ...DEFAULT_FILTERS };
}
