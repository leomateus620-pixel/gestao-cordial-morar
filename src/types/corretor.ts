export type CorretorImobiliaria = "cordial" | "morar" | "ambas";

export type CorretorStatus = "ativo" | "inativo";

export type CorretorPerformanceTrend = "alta" | "estavel" | "queda";

export type CorretorPeriodFilter = "mes" | "ultimos_30" | "trimestre" | "ano";

export type CorretorStatusFilter = "ativos" | "inativos" | "todos";

export type CorretorSortKey =
  | "conversao"
  | "contratos"
  | "atendimentos"
  | "comissao"
  | "agenciamentos";

export type CorretorFiltersState = {
  periodo: CorretorPeriodFilter;
  status: CorretorStatusFilter;
  ordenacao: CorretorSortKey;
  busca: string;
};

export type Corretor = {
  id: string;
  nome: string;
  iniciais: string;
  imobiliaria: CorretorImobiliaria;
  creci: string;
  status: CorretorStatus;

  atendimentosMes: number;
  atendimentosRecebidos: number;
  atendimentosEmAndamento: number;
  visitasRealizadas: number;
  propostasFeitas: number;
  contratosFechados: number;
  vendasFechadas: number;
  alugueisFechados: number;

  agenciamentosFeitos: number;
  agenciamentosComPlaca: number;
  agenciamentosComFotos: number;
  agenciamentosNoSite: number;
  agenciamentosValidados: number;

  comissaoPrevista: number;
  comissaoPaga: number;
  comissaoMes: number;

  taxaConversao: number;
  mediaMensalContratos: number;
  ticketMedio: number;

  rankingPosicao?: number;
  performanceTrend?: CorretorPerformanceTrend;

  ultimoAtendimentoEm?: string;
  observacaoGestao?: string;
};

export type CorretoresSummary = {
  total: number;
  ativos: number;
  atendimentosRecebidos: number;
  atendimentosEmAndamento: number;
  visitasRealizadas: number;
  propostasFeitas: number;
  contratosFechados: number;
  vendasFechadas: number;
  alugueisFechados: number;
  agenciamentosFeitos: number;
  agenciamentosChecklistPercent: number;
  comissaoPrevista: number;
  comissaoPaga: number;
  comissaoPendente: number;
  taxaMediaConversao: number;
  ticketMedio: number;
};

export type CorretorDashboardChartItem = {
  nome: string;
  imobiliaria: CorretorImobiliaria;
  atendimentos: number;
  contratos: number;
  conversao: number;
};
