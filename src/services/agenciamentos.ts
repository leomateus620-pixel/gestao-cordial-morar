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
  Record<keyof AgenciamentoInput | "checklist" | "permissaoValidacao", string>
>;

const DEFAULT_CHECKLIST: AgenciamentoChecklist = {
  fotosHorizontal: false,
  fotosVertical: false,
  fotosDrive: false,
  placaInstalada: false,
  cadastradoMorar: false,
  cadastradoCordial: false,
  videoRealizado: false,
  validado: false,
};

const DEFAULT_FILTERS: AgenciamentoFiltersState = {
  imobiliaria: "todas",
  status: "todos",
  periodo: "todos",
  corretorId: "todos",
  tipoImovel: "todos",
  finalidade: "todas",
  checklist: "todos",
  busca: "",
};

const statusLabels: Record<AgenciamentoStatus, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  pendente_fotos: "Pendente fotos",
  pendente_placa: "Pendente placa",
  pendente_site: "Pendente site",
  aguardando_validacao: "Aguardando validação",
  validado: "Validado",
  reprovado: "Reprovado",
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
  reprovado: "danger",
  cancelado: "danger",
};

const tipoLabels: Record<AgenciamentoTipoImovel, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  terreno: "Terreno",
  sala_comercial: "Sala comercial",
  area_rural: "Área rural",
  predio: "Prédio",
  outro: "Outro",
};

const origemLabels: Record<AgenciamentoOrigem, string> = {
  indicacao: "Indicação",
  prospeccao_ativa: "Prospecção ativa",
  cliente_antigo: "Cliente antigo",
  site: "Site",
  whatsapp: "WhatsApp",
  presencial: "Presencial",
  outro: "Outro",
};

const checklistKeys: Array<keyof AgenciamentoChecklist> = [
  "fotosHorizontal",
  "fotosVertical",
  "fotosDrive",
  "placaInstalada",
  "cadastradoMorar",
  "cadastradoCordial",
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
    fotosHorizontal: Boolean(input?.fotosHorizontal),
    fotosVertical: Boolean(input?.fotosVertical),
    fotosDrive: Boolean(input?.fotosDrive),
    placaInstalada: Boolean(input?.placaInstalada),
    cadastradoMorar: Boolean(input?.cadastradoMorar),
    cadastradoCordial: Boolean(input?.cadastradoCordial),
    videoRealizado: Boolean(input?.videoRealizado),
    validado: Boolean(input?.validado),
  };
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
    todos: "Todo período",
    mes: "Este mês",
    ultimos_30: "Últimos 30 dias",
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
    endereco: safeString(input.endereco, "Endereço não informado"),
    bairro: safeString(input.bairro),
    cidade: safeString(input.cidade),
    imobiliaria: safeImobiliaria(input.imobiliaria),
    finalidade:
      input.finalidade === "venda" || input.finalidade === "aluguel" ? input.finalidade : undefined,
    descricaoImovel: safeString(input.descricaoImovel),
    codigoMorar: safeString(input.codigoMorar),
    codigoCordial: safeString(input.codigoCordial),
    proprietarioNome: safeString(input.proprietarioNome, "Proprietário não informado"),
    proprietarioTelefone: formatPhoneBR(safeString(input.proprietarioTelefone)),
    proprietarioContatoPreferencial: input.proprietarioContatoPreferencial ?? "whatsapp",
    proprietarioObservacoes: safeString(input.proprietarioObservacoes),
    corretorId: safeString(input.corretorId),
    corretorNome: safeString(input.corretorNome, "Corretor não informado"),
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
  if (periodo === "todos") return true;
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
  if (checklist === "com_fotos") return item.checklist.fotosHorizontal && item.checklist.fotosVertical;
  if (checklist === "sem_fotos") return !(item.checklist.fotosHorizontal && item.checklist.fotosVertical);
  if (checklist === "no_site") return item.checklist.cadastradoMorar && item.checklist.cadastradoCordial;
  if (checklist === "fora_site") return !(item.checklist.cadastradoMorar && item.checklist.cadastradoCordial);
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
      const matchesFinalidade =
        nextFilters.finalidade === "todas" ||
        (nextFilters.finalidade === "sem_classificacao"
          ? !item.finalidade
          : item.finalidade === nextFilters.finalidade);
      const matchesSearch =
        !query ||
        [
          item.endereco,
          item.codigoMorar,
          item.codigoCordial,
          item.bairro,
          item.proprietarioNome,
          item.proprietarioTelefone,
          item.corretorNome,
          item.observacoesInternas,
          getAgenciamentoTipoLabel(item.tipoImovel),
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(query));

      return (
        matchesAgency &&
        matchesBroker &&
        matchesType &&
        matchesFinalidade &&
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
    fotosCompletas: agenciamentos.filter(
      (item) => item.checklist.fotosHorizontal && item.checklist.fotosVertical,
    ).length,
    placasInstaladas: agenciamentos.filter((item) => item.checklist.placaInstalada).length,
    cadastradosSite: agenciamentos.filter(
      (item) => item.checklist.cadastradoMorar && item.checklist.cadastradoCordial,
    ).length,
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
    current.noSite += item.checklist.cadastradoMorar && item.checklist.cadastradoCordial ? 1 : 0;
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

export function validateAgenciamentoInput(
  input: AgenciamentoInput,
  canManage: boolean,
  alreadyValidated = false,
) {
  const errors: AgenciamentoValidationErrors = {};

  if (!input.tipoImovel) errors.tipoImovel = "Informe o tipo do imóvel.";
  if (!input.endereco.trim()) errors.endereco = "Informe o endereço.";
  if (!input.imobiliaria) errors.imobiliaria = "Informe a imobiliária.";
  if (input.finalidade !== "venda" && input.finalidade !== "aluguel") {
    errors.finalidade = "Classifique o agenciamento como Venda ou Aluguel.";
  }
  if (!input.proprietarioNome.trim()) errors.proprietarioNome = "Informe o proprietário.";
  if (digits(input.proprietarioTelefone).length < 10) {
    errors.proprietarioTelefone = "Informe um telefone válido.";
  }
  if (!input.corretorId.trim()) errors.corretorId = "Informe o corretor responsável.";
  if (!input.dataAgenciamento.trim()) errors.dataAgenciamento = "Informe a data.";
  if (!input.origem) errors.origem = "Informe a origem.";
  if (!input.status) errors.status = "Informe o status.";
  // Only block when the user is *turning on* validation. A record that is
  // already validated must stay editable (e.g. to reclassify Venda/Aluguel).
  if (input.checklist.validado && !canManage && !alreadyValidated) {
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
  if (user.perfil === "admin_owner" || user.perfil === "secretaria") return true;
  if (user.perfil !== "corretor") return false;
  // Ownership is decided by the real auth id stored on the record. The
  // name/initials based `corretorId` is only a secondary hint.
  return (
    item.corretorId === user.id ||
    item.criadoPorId === user.id ||
    (Boolean(corretorId) && item.corretorId === corretorId)
  );
}


export function getAgenciamentosVisibleToUser(
  agenciamentos: Agenciamento[],
  user: { perfil: string; id: string } | null | undefined,
  _corretorId?: string,
) {
  if (!user) return [];
  // Server-side RLS + listAgenciamentos already scopes rows to the user
  // (created_by OR corretor_id). Trust the server response here to avoid
  // hiding rows during transient client-side hydration.
  return agenciamentos;
}

