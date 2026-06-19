import type { Corretor } from "@/types/corretor";
import type {
  Agenciamento,
  AgenciamentoChecklist,
  AgenciamentoChecklistFilter,
  AgenciamentoCorretorRanking,
  AgenciamentoCorretorStats,
  AgenciamentoFiltersState,
  AgenciamentoImobiliaria,
  AgenciamentoInput,
  AgenciamentoOrigem,
  AgenciamentoPeriodFilter,
  AgenciamentoStatus,
  AgenciamentoStatusFilter,
  AgenciamentoSummary,
  AgenciamentoTipoImovel,
} from "@/types/agenciamento";

type LegacyAgenciamento = Partial<Agenciamento> & { id: string };

export type AgenciamentoValidationErrors = Partial<
  Record<
    keyof AgenciamentoInput | "checklist" | "driveFolderUrl" | "siteUrl" | "permissaoValidacao",
    string
  >
>;

const DEFAULT_CHECKLIST: AgenciamentoChecklist = {
  fotosRealizadas: false,
  fotosDrive: false,
  placaInstalada: false,
  cadastradoSite: false,
  videoRealizado: false,
  validado: false,
};

const DEFAULT_FILTERS: AgenciamentoFiltersState = {
  imobiliaria: "todas",
  status: "todos",
  periodo: "mes",
  corretorId: "todos",
  tipoImovel: "todos",
  checklist: "todos",
  busca: "",
};

const statusLabels: Record<AgenciamentoStatus, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  pendente_fotos: "Pendente fotos",
  pendente_placa: "Pendente placa",
  pendente_site: "Pendente site",
  aguardando_validacao: "Aguardando validacao",
  validado: "Validado",
  cancelado: "Cancelado",
};

const statusTone: Record<AgenciamentoStatus, "neutral" | "warning" | "success" | "danger"> = {
  novo: "neutral",
  em_andamento: "neutral",
  pendente_fotos: "warning",
  pendente_placa: "warning",
  pendente_site: "warning",
  aguardando_validacao: "warning",
  validado: "success",
  cancelado: "danger",
};

const tipoLabels: Record<AgenciamentoTipoImovel, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  terreno: "Terreno",
  sala_comercial: "Sala comercial",
  area_rural: "Area rural",
  predio: "Predio",
  outro: "Outro",
};

const origemLabels: Record<AgenciamentoOrigem, string> = {
  indicacao: "Indicacao",
  prospeccao_ativa: "Prospeccao ativa",
  cliente_antigo: "Cliente antigo",
  site: "Site",
  whatsapp: "WhatsApp",
  presencial: "Presencial",
  outro: "Outro",
};

const checklistKeys: Array<keyof AgenciamentoChecklist> = [
  "fotosRealizadas",
  "fotosDrive",
  "placaInstalada",
  "cadastradoSite",
  "videoRealizado",
  "validado",
];

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeDate(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) return fallback;
  return value;
}

function safeStatus(value: unknown): AgenciamentoStatus {
  return Object.keys(statusLabels).includes(String(value)) ? (value as AgenciamentoStatus) : "novo";
}

function safeTipo(value: unknown): AgenciamentoTipoImovel {
  return Object.keys(tipoLabels).includes(String(value))
    ? (value as AgenciamentoTipoImovel)
    : "casa";
}

function safeOrigem(value: unknown): AgenciamentoOrigem {
  return Object.keys(origemLabels).includes(String(value))
    ? (value as AgenciamentoOrigem)
    : "indicacao";
}

function safeImobiliaria(value: unknown): AgenciamentoImobiliaria {
  return value === "morar" || value === "ambas" ? value : "cordial";
}

function normalizeChecklist(input?: Partial<AgenciamentoChecklist>): AgenciamentoChecklist {
  return {
    fotosRealizadas: Boolean(input?.fotosRealizadas),
    fotosDrive: Boolean(input?.fotosDrive),
    placaInstalada: Boolean(input?.placaInstalada),
    cadastradoSite: Boolean(input?.cadastradoSite),
    videoRealizado: Boolean(input?.videoRealizado),
    validado: Boolean(input?.validado),
  };
}

function isValidUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhoneBR(value: string) {
  const phone = digits(value).slice(0, 11);
  if (phone.length <= 2) return phone;
  if (phone.length <= 6) return `(${phone.slice(0, 2)}) ${phone.slice(2)}`;
  if (phone.length <= 10) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  }
  return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
}

export function getDefaultAgenciamentoFilters(): AgenciamentoFiltersState {
  return { ...DEFAULT_FILTERS };
}

export function getAgenciamentoStatusLabel(status: AgenciamentoStatus | AgenciamentoStatusFilter) {
  if (status === "todos") return "Todos";
  if (status === "pendentes") return "Pendentes";
  return statusLabels[status as AgenciamentoStatus] ?? "Novo";
}

export function getAgenciamentoStatusTone(status: AgenciamentoStatus) {
  return statusTone[status];
}

export function getAgenciamentoTipoLabel(tipo: AgenciamentoTipoImovel) {
  return tipoLabels[tipo];
}

export function getAgenciamentoOrigemLabel(origem: AgenciamentoOrigem) {
  return origemLabels[origem];
}

export function getAgenciamentoImobiliariaLabel(imobiliaria: AgenciamentoImobiliaria) {
  if (imobiliaria === "morar") return "Morar";
  if (imobiliaria === "ambas") return "Cordial + Morar";
  return "Cordial";
}

export function getAgenciamentoPeriodLabel(periodo: AgenciamentoPeriodFilter) {
  const labels: Record<AgenciamentoPeriodFilter, string> = {
    mes: "Este mes",
    ultimos_30: "Ultimos 30 dias",
    trimestre: "Trimestre",
    ano: "Ano",
  };
  return labels[periodo];
}

export function normalizeAgenciamento(input: LegacyAgenciamento): Agenciamento {
  const timestamp = new Date().toISOString();
  const status = safeStatus(input.status);
  const checklist = normalizeChecklist({
    ...input.checklist,
    validado: input.checklist?.validado ?? status === "validado",
  });

  return {
    id: input.id,
    tipoImovel: safeTipo(input.tipoImovel),
    endereco: safeString(input.endereco, "Endereco nao informado"),
    bairro: safeString(input.bairro),
    cidade: safeString(input.cidade),
    imobiliaria: safeImobiliaria(input.imobiliaria),
    descricaoImovel: safeString(input.descricaoImovel),
    proprietarioNome: safeString(input.proprietarioNome, "Proprietario nao informado"),
    proprietarioTelefone: formatPhoneBR(safeString(input.proprietarioTelefone)),
    proprietarioContatoPreferencial: input.proprietarioContatoPreferencial ?? "whatsapp",
    proprietarioObservacoes: safeString(input.proprietarioObservacoes),
    corretorId: safeString(input.corretorId),
    corretorNome: safeString(input.corretorNome, "Corretor nao informado"),
    dataAgenciamento: safeDate(input.dataAgenciamento, timestamp),
    origem: safeOrigem(input.origem),
    status,
    checklist,
    driveFolderUrl: safeString(input.driveFolderUrl),
    siteUrl: safeString(input.siteUrl),
    observacoesInternas: safeString(input.observacoesInternas),
    criadoPorId: safeString(input.criadoPorId),
    criadoPorNome: safeString(input.criadoPorNome),
    validadoPorId: safeString(input.validadoPorId),
    validadoPorNome: safeString(input.validadoPorNome),
    validadoEm: input.validadoEm ? safeDate(input.validadoEm) : undefined,
    criadoEm: safeDate(input.criadoEm, timestamp),
    atualizadoEm: safeDate(input.atualizadoEm, timestamp),
  };
}

export function normalizeAgenciamentos(items: LegacyAgenciamento[] = []) {
  return items.map(normalizeAgenciamento);
}

export function getChecklistCompletedCount(checklist: AgenciamentoChecklist) {
  return checklistKeys.reduce((total, key) => total + (checklist[key] ? 1 : 0), 0);
}

export function getChecklistCompletionPercent(checklist: AgenciamentoChecklist) {
  return Math.round((getChecklistCompletedCount(checklist) / checklistKeys.length) * 100);
}

function startOfCurrentMonth(reference: Date) {
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

function startOfCurrentQuarter(reference: Date) {
  const quarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
  return new Date(reference.getFullYear(), quarterStartMonth, 1);
}

function startOfCurrentYear(reference: Date) {
  return new Date(reference.getFullYear(), 0, 1);
}

function matchesPeriod(dateIso: string, periodo: AgenciamentoPeriodFilter, reference = new Date()) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;
  if (periodo === "ano") return date >= startOfCurrentYear(reference);
  if (periodo === "trimestre") return date >= startOfCurrentQuarter(reference);
  if (periodo === "ultimos_30") {
    const thirtyDaysAgo = new Date(reference);
    thirtyDaysAgo.setDate(reference.getDate() - 30);
    return date >= thirtyDaysAgo;
  }
  return date >= startOfCurrentMonth(reference);
}

function matchesStatus(item: Agenciamento, status: AgenciamentoStatusFilter) {
  if (status === "todos") return true;
  if (status === "pendentes") {
    return (
      item.status === "pendente_fotos" ||
      item.status === "pendente_placa" ||
      item.status === "pendente_site" ||
      item.status === "aguardando_validacao"
    );
  }
  return item.status === status;
}

function matchesChecklist(item: Agenciamento, checklist: AgenciamentoChecklistFilter) {
  if (checklist === "todos") return true;
  if (checklist === "com_placa") return item.checklist.placaInstalada;
  if (checklist === "sem_placa") return !item.checklist.placaInstalada;
  if (checklist === "com_fotos") return item.checklist.fotosRealizadas;
  if (checklist === "sem_fotos") return !item.checklist.fotosRealizadas;
  if (checklist === "no_site") return item.checklist.cadastradoSite;
  if (checklist === "fora_site") return !item.checklist.cadastradoSite;
  if (checklist === "com_drive") return item.checklist.fotosDrive;
  if (checklist === "sem_drive") return !item.checklist.fotosDrive;
  return true;
}

export function filterAgenciamentos(
  agenciamentos: Agenciamento[],
  filters: Partial<AgenciamentoFiltersState> = DEFAULT_FILTERS,
) {
  const nextFilters = { ...DEFAULT_FILTERS, ...filters };
  const query = nextFilters.busca.trim().toLowerCase();

  return agenciamentos
    .filter((item) => {
      const matchesAgency =
        nextFilters.imobiliaria === "todas" ||
        item.imobiliaria === nextFilters.imobiliaria ||
        item.imobiliaria === "ambas";
      const matchesBroker =
        nextFilters.corretorId === "todos" || item.corretorId === nextFilters.corretorId;
      const matchesType =
        nextFilters.tipoImovel === "todos" || item.tipoImovel === nextFilters.tipoImovel;
      const matchesSearch =
        !query ||
        [
          item.endereco,
          item.bairro,
          item.proprietarioNome,
          item.proprietarioTelefone,
          item.corretorNome,
          item.observacoesInternas,
          getAgenciamentoTipoLabel(item.tipoImovel),
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));

      return (
        matchesAgency &&
        matchesBroker &&
        matchesType &&
        matchesPeriod(item.dataAgenciamento, nextFilters.periodo) &&
        matchesStatus(item, nextFilters.status) &&
        matchesChecklist(item, nextFilters.checklist) &&
        matchesSearch
      );
    })
    .sort(
      (a, b) => new Date(b.dataAgenciamento).getTime() - new Date(a.dataAgenciamento).getTime(),
    );
}

export function calculateAgenciamentosSummary(agenciamentos: Agenciamento[]): AgenciamentoSummary {
  const total = agenciamentos.length;
  const checklistTotal = agenciamentos.reduce(
    (sum, item) => sum + getChecklistCompletionPercent(item.checklist),
    0,
  );

  return {
    total,
    mes: agenciamentos.filter((item) => matchesPeriod(item.dataAgenciamento, "mes")).length,
    pendentesValidacao: agenciamentos.filter((item) => item.status === "aguardando_validacao")
      .length,
    fotosDrive: agenciamentos.filter((item) => item.checklist.fotosDrive).length,
    placasInstaladas: agenciamentos.filter((item) => item.checklist.placaInstalada).length,
    cadastradosSite: agenciamentos.filter((item) => item.checklist.cadastradoSite).length,
    validados: agenciamentos.filter((item) => item.checklist.validado || item.status === "validado")
      .length,
    checklistCompleto: agenciamentos.filter(
      (item) => getChecklistCompletedCount(item.checklist) === checklistKeys.length,
    ).length,
    percentualChecklistMedio: total > 0 ? Math.round(checklistTotal / total) : 0,
  };
}

export function rankAgenciamentosByCorretor(
  agenciamentos: Agenciamento[],
): AgenciamentoCorretorRanking[] {
  const map = new Map<string, AgenciamentoCorretorRanking>();

  agenciamentos.forEach((item) => {
    const current =
      map.get(item.corretorId) ??
      ({
        corretorId: item.corretorId,
        corretorNome: item.corretorNome,
        total: 0,
        comPlaca: 0,
        fotosDrive: 0,
        noSite: 0,
        validados: 0,
        percentualChecklist: 0,
      } satisfies AgenciamentoCorretorRanking);

    current.total += 1;
    current.comPlaca += item.checklist.placaInstalada ? 1 : 0;
    current.fotosDrive += item.checklist.fotosDrive ? 1 : 0;
    current.noSite += item.checklist.cadastradoSite ? 1 : 0;
    current.validados += item.checklist.validado || item.status === "validado" ? 1 : 0;
    current.percentualChecklist += getChecklistCompletionPercent(item.checklist);
    map.set(item.corretorId, current);
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      percentualChecklist:
        item.total > 0
          ? Math.round(item.percentualChecklist / item.total)
          : item.percentualChecklist,
    }))
    .sort((a, b) => {
      const byTotal = b.total - a.total;
      if (byTotal !== 0) return byTotal;
      return b.percentualChecklist - a.percentualChecklist;
    });
}

export function getAgenciamentosCorretorStats(
  agenciamentos: Agenciamento[],
): Map<string, AgenciamentoCorretorStats> {
  const ranking = rankAgenciamentosByCorretor(agenciamentos);
  return new Map(
    ranking.map((item) => [
      item.corretorId,
      {
        agenciamentosFeitos: item.total,
        agenciamentosComPlaca: item.comPlaca,
        agenciamentosComFotos: item.fotosDrive,
        agenciamentosNoSite: item.noSite,
        agenciamentosValidados: item.validados,
        percentualChecklist: item.percentualChecklist,
      },
    ]),
  );
}

export function applyAgenciamentoStatsToCorretores(
  corretores: Corretor[],
  agenciamentos: Agenciamento[],
) {
  const stats = getAgenciamentosCorretorStats(agenciamentos);
  return corretores.map((corretor) => {
    const brokerStats = stats.get(corretor.id);
    if (!brokerStats) return corretor;
    return {
      ...corretor,
      agenciamentosFeitos: brokerStats.agenciamentosFeitos,
      agenciamentosComPlaca: brokerStats.agenciamentosComPlaca,
      agenciamentosComFotos: brokerStats.agenciamentosComFotos,
      agenciamentosNoSite: brokerStats.agenciamentosNoSite,
      agenciamentosValidados: brokerStats.agenciamentosValidados,
    };
  });
}

export function validateAgenciamentoInput(input: AgenciamentoInput, canManage: boolean) {
  const errors: AgenciamentoValidationErrors = {};

  if (!input.tipoImovel) errors.tipoImovel = "Informe o tipo do imovel.";
  if (!input.endereco.trim()) errors.endereco = "Informe o endereco.";
  if (!input.imobiliaria) errors.imobiliaria = "Informe a imobiliaria.";
  if (!input.proprietarioNome.trim()) errors.proprietarioNome = "Informe o proprietario.";
  if (digits(input.proprietarioTelefone).length < 10) {
    errors.proprietarioTelefone = "Informe um telefone valido.";
  }
  if (!input.corretorId.trim()) errors.corretorId = "Informe o corretor responsavel.";
  if (!input.dataAgenciamento.trim()) errors.dataAgenciamento = "Informe a data.";
  if (!input.origem) errors.origem = "Informe a origem.";
  if (!input.status) errors.status = "Informe o status.";
  if (input.driveFolderUrl && !isValidUrl(input.driveFolderUrl)) {
    errors.driveFolderUrl = "Use um link valido.";
  }
  if (input.siteUrl && !isValidUrl(input.siteUrl)) {
    errors.siteUrl = "Use um link valido.";
  }
  if (input.checklist.validado && !canManage) {
    errors.permissaoValidacao = "Somente administradores podem validar o agenciamento.";
  }

  return errors;
}

export function createAgenciamentoRecord(input: AgenciamentoInput): Agenciamento {
  const now = new Date().toISOString();
  const id = input.id ?? `ag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return normalizeAgenciamento({
    ...input,
    id,
    criadoEm: now,
    atualizadoEm: now,
    status: input.checklist.validado ? "validado" : input.status,
  });
}

export function updateAgenciamentoRecord(current: Agenciamento, patch: Partial<AgenciamentoInput>) {
  const merged: Agenciamento = {
    ...current,
    ...patch,
    checklist: normalizeChecklist({ ...current.checklist, ...patch.checklist }),
    atualizadoEm: new Date().toISOString(),
  };
  return normalizeAgenciamento({
    ...merged,
    status: merged.checklist.validado ? "validado" : merged.status,
  });
}

export function validateAgenciamentoRecord(
  current: Agenciamento,
  validator: { id: string; nome: string },
) {
  const now = new Date().toISOString();
  return normalizeAgenciamento({
    ...current,
    status: "validado",
    checklist: { ...current.checklist, validado: true },
    validadoPorId: validator.id,
    validadoPorNome: validator.nome,
    validadoEm: now,
    atualizadoEm: now,
  });
}

export function canEditAgenciamento(
  item: Agenciamento,
  user: { perfil: string; id: string } | null | undefined,
  corretorId?: string,
) {
  if (!user) return false;
  if (user.perfil === "admin_owner") return true;
  if (user.perfil !== "corretor") return false;
  return item.corretorId === corretorId && item.status !== "validado" && !item.checklist.validado;
}

export function getAgenciamentosVisibleToUser(
  agenciamentos: Agenciamento[],
  user: { perfil: string; id: string } | null | undefined,
  corretorId?: string,
) {
  if (!user) return [];
  if (user.perfil === "admin_owner") return agenciamentos;
  if (user.perfil === "corretor" && corretorId) {
    return agenciamentos.filter((item) => item.corretorId === corretorId);
  }
  return [];
}
