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
  | "agenciamentos"
  | "bonificacoes";

export type CorretorFiltersState = {
  periodo: CorretorPeriodFilter;
  status: CorretorStatusFilter;
  ordenacao: CorretorSortKey;
  corretorId: string;
  busca: string;
};

export type CorretorActivityKind = "atendimento" | "agenda" | "agenciamento" | "venda" | "aluguel";

export type CorretorActivity = {
  id: string;
  kind: CorretorActivityKind;
  title: string;
  detail: string;
  occurredAt: string;
  route: "/atendimentos" | "/agenda" | "/agenciamentos" | "/vendas" | "/alugueis";
};

export type CorretorNextCommitment = {
  id: string;
  title: string;
  startsAt: string;
  status: string;
};

export type CorretorSourceKey =
  | "atendimentos"
  | "agenda"
  | "agenciamentos"
  | "vendas"
  | "alugueis"
  | "respostas"
  | "bonificacoes";

export type CorretorSourceStatus = Record<CorretorSourceKey, "ready" | "error">;

export type Corretor = {
  id: string;
  nome: string;
  iniciais: string;
  imobiliaria: CorretorImobiliaria;
  agencies: Array<Exclude<CorretorImobiliaria, "ambas">>;
  creci: string;
  status: CorretorStatus;

  atendimentosMes: number;
  atendimentosRecebidos: number;
  atendimentosEmAndamento: number;
  atendimentosConcluidos: number;
  visitasRealizadas: number;
  propostasFeitas: number;
  contratosDeAtendimento: number;
  contratosFechados: number;
  vendasFechadas: number;
  vendasRegistradas: number;
  valorVendas: number;
  alugueisFechados: number;
  alugueisAtribuidos: number;
  alugueisAtivos: number;
  alugueisEncerrados: number;

  agenciamentosFeitos: number;
  agenciamentosAtivos: number;
  agenciamentosConcluidos: number;
  agenciamentosAcoesPendentes: number;
  agenciamentosComPlaca: number;
  agenciamentosComFotos: number;
  agenciamentosNoSite: number;
  agenciamentosValidados: number;
  agenciamentosChecklistPercent: number;

  bonificacoesTotal: number;
  bonificacoesPagas: number;
  bonificacoesPendentes: number;

  comissaoPrevista: number;
  comissaoPaga: number | null;
  comissaoMes: number;
  comissaoPrevistaDisponivel: boolean;
  comissaoPagaDisponivel: boolean;

  taxaConversao: number;
  mediaMensalContratos: number;
  ticketMedio: number;

  agendaHoje: number;
  agendaProximos: number;
  agendaConcluidos: number;
  agendaPendentes: number;
  proximoCompromisso?: CorretorNextCommitment;

  mediaRespostaSegundos: number | null;
  medianaRespostaSegundos: number | null;
  respostaMaisRapidaSegundos: number | null;
  respostaMaisLentaSegundos: number | null;
  respostasMedidas: number;
  respostasPendentes: number;

  rankingPosicao?: number;
  performanceTrend?: CorretorPerformanceTrend;
  ultimoAtendimentoEm?: string;
  destaqueOperacional?: string;
  observacaoGestao?: string;
  atividadesRecentes: CorretorActivity[];
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
  agendaProximos: number;
  agenciamentosFeitos: number;
  agenciamentosChecklistPercent: number;
  bonificacoesTotal: number;
  bonificacoesPagas: number;
  bonificacoesPendentes: number;
  comissaoPrevista: number;
  comissaoPrevistaDisponivel: boolean;
  comissaoPaga: number | null;
  comissaoPagaDisponivel: boolean;
  comissaoPendente: number | null;
  taxaMediaConversao: number;
  ticketMedio: number;
};

export type CorretoresOperationalResult = {
  periodo: CorretorPeriodFilter;
  periodoInicio: string;
  periodoFim: string;
  generatedAt: string;
  rows: Corretor[];
  sourceStatus: CorretorSourceStatus;
  unattributed: {
    sales: number;
    rentals: number;
  };
};

export type CorretorDashboardChartItem = {
  nome: string;
  imobiliaria: CorretorImobiliaria;
  atendimentos: number;
  contratos: number;
  conversao: number;
};
