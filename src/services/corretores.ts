import type {
  Corretor,
  CorretorActivity,
  CorretorDashboardChartItem,
  CorretorFiltersState,
  CorretorImobiliaria,
  CorretorPeriodFilter,
  CorretorSortKey,
  CorretorSourceStatus,
  CorretorStatusFilter,
  CorretoresOperationalResult,
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

export type CorretorRosterRecord = {
  id: string;
  nome: string;
  iniciais?: string | null;
  cargo?: string | null;
  agencies: string[];
};

export type CorretorAttendanceRecord = {
  id: string;
  corretorId: string | null;
  clienteNome: string;
  status: string;
  pipelineStage: string;
  imobiliaria: string;
  createdAt: string;
  updatedAt: string;
};

export type CorretorAssignmentRecord = {
  id: string;
  attendanceId: string;
  brokerId: string;
  assignedAt: string;
  status: string;
  imobiliaria: string | null;
};

export type CorretorAttendanceHistoryRecord = {
  id: string;
  attendanceId: string;
  actorId: string | null;
  eventType: string;
  newValue: unknown;
  createdAt: string;
  imobiliaria: string;
};

export type CorretorAgendaRecord = {
  id: string;
  title: string;
  type: string;
  status: string;
  startsAt: string;
  completedAt: string | null;
  ownerId: string | null;
  participants: Array<{ userId: string }>;
  imobiliaria: string;
};

export type CorretorListingRecord = {
  id: string;
  brokerId: string | null;
  createdBy: string | null;
  address: string;
  status: string;
  date: string;
  imobiliaria: string;
  checklist: boolean[];
};

export type CorretorSaleRecord = {
  id: string;
  ownerId: string;
  propertyName: string;
  status: string;
  value: number;
  commissionValue: number | null;
  date: string;
  imobiliaria: string;
};

export type CorretorCommissionInstallmentRecord = {
  id: string;
  saleId: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
};

export type CorretorRentalRecord = {
  id: string;
  createdBy: string;
  status: string;
  brand: string;
  monthlyValue: number;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
};

export type CorretorResponseRecord = {
  brokerId: string;
  averageSeconds: number | null;
  medianSeconds: number | null;
  fastestSeconds: number | null;
  slowestSeconds: number | null;
  completedCount: number;
  pendingCount: number;
  lateCount?: number;
};

export type CorretorBonusRecord = {
  id: string;
  brokerId: string | null;
  status: string;
  categoria: string;
  periodoRef: string | null;
};

export type CorretoresOperationalSources = {
  roster: CorretorRosterRecord[];
  attendances: CorretorAttendanceRecord[];
  assignments: CorretorAssignmentRecord[];
  attendanceHistory: CorretorAttendanceHistoryRecord[];
  agenda: CorretorAgendaRecord[];
  listings: CorretorListingRecord[];
  sales: CorretorSaleRecord[];
  commissionInstallments: CorretorCommissionInstallmentRecord[];
  rentals: CorretorRentalRecord[];
  responses: CorretorResponseRecord[];
  bonuses?: CorretorBonusRecord[];
};

export type CorretorPeriodRange = {
  start: Date;
  end: Date;
};

const DEFAULT_FILTERS: CorretorFiltersState = {
  periodo: "mes",
  status: "ativos",
  ordenacao: "contratos",
  corretorId: "todos",
  busca: "",
};

const READY_SOURCES: CorretorSourceStatus = {
  atendimentos: "ready",
  agenda: "ready",
  agenciamentos: "ready",
  vendas: "ready",
  alugueis: "ready",
  respostas: "ready",
  bonificacoes: "ready",
};

const sortAccessors: Record<CorretorSortKey, (corretor: Corretor) => number> = {
  conversao: (corretor) => corretor.taxaConversao,
  contratos: (corretor) => corretor.contratosFechados,
  atendimentos: (corretor) => corretor.atendimentosRecebidos,
  comissao: (corretor) =>
    corretor.comissaoPrevistaDisponivel ? corretor.comissaoPrevista : Number.NEGATIVE_INFINITY,
  agenciamentos: (corretor) => corretor.agenciamentosFeitos,
  bonificacoes: (corretor) => corretor.bonificacoesTotal,
};

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAgency(value: unknown): CorretorImobiliaria {
  return value === "morar" || value === "ambas" ? value : "cordial";
}

function agenciesToAgency(agencies: string[]): CorretorImobiliaria {
  const valid = new Set(agencies.filter((agency) => agency === "cordial" || agency === "morar"));
  if (valid.size > 1) return "ambas";
  return valid.has("morar") ? "morar" : "cordial";
}

function safeInitials(name: string, stored?: string | null) {
  const fromProfile = stored?.trim();
  if (fromProfile) return fromProfile.slice(0, 3).toUpperCase();
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function dateAtSaoPauloMidnight(year: number, month: number, day: number) {
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
  return new Date(`${date}T00:00:00-03:00`);
}

function saoPauloParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function timestampOf(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return dateAtSaoPauloMidnight(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    ).getTime();
  }
  return new Date(value).getTime();
}

function activityTimestamp(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateOnly) return value;
  const timestamp = dateAtSaoPauloMidnight(
    Number(dateOnly[1]),
    Number(dateOnly[2]),
    Number(dateOnly[3]),
  );
  timestamp.setUTCHours(timestamp.getUTCHours() + 12);
  return timestamp.toISOString();
}

export function getCorretorPeriodRange(
  periodo: CorretorPeriodFilter,
  now = new Date(),
): CorretorPeriodRange {
  const { year, month, day } = saoPauloParts(now);
  if (periodo === "ultimos_30") {
    const currentDay = dateAtSaoPauloMidnight(year, month, day);
    currentDay.setUTCDate(currentDay.getUTCDate() - 29);
    return { start: currentDay, end: now };
  }
  if (periodo === "ano") {
    return {
      start: dateAtSaoPauloMidnight(year, 1, 1),
      end: dateAtSaoPauloMidnight(year + 1, 1, 1),
    };
  }
  if (periodo === "trimestre") {
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const endYear = quarterMonth === 10 ? year + 1 : year;
    const endMonth = quarterMonth === 10 ? 1 : quarterMonth + 3;
    return {
      start: dateAtSaoPauloMidnight(year, quarterMonth, 1),
      end: dateAtSaoPauloMidnight(endYear, endMonth, 1),
    };
  }
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: dateAtSaoPauloMidnight(year, month, 1),
    end: dateAtSaoPauloMidnight(nextYear, nextMonth, 1),
  };
}

function isWithin(value: string | null | undefined, range: CorretorPeriodRange) {
  const timestamp = timestampOf(value);
  return (
    Number.isFinite(timestamp) &&
    timestamp >= range.start.getTime() &&
    timestamp < range.end.getTime()
  );
}

function isAgencyMatch(value: string | null | undefined, agency: AgencyFilter) {
  return agency === "todas" || value === agency || value === "ambas";
}

function addActivity(corretor: Corretor, activity: CorretorActivity) {
  if (corretor.atividadesRecentes.some((item) => item.id === activity.id)) return;
  corretor.atividadesRecentes.push(activity);
}

function stageFromHistory(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stage = (value as Record<string, unknown>).pipeline_stage;
  return typeof stage === "string" ? stage : null;
}

function createEmptyCorretor(profile: CorretorRosterRecord): Corretor {
  const agencies = profile.agencies.filter(
    (agency): agency is "cordial" | "morar" => agency === "cordial" || agency === "morar",
  );
  return {
    id: profile.id,
    nome: profile.nome,
    iniciais: safeInitials(profile.nome, profile.iniciais),
    imobiliaria: agenciesToAgency(agencies),
    agencies,
    creci: "",
    status: "ativo",
    atendimentosMes: 0,
    atendimentosRecebidos: 0,
    atendimentosEmAndamento: 0,
    atendimentosConcluidos: 0,
    visitasRealizadas: 0,
    propostasFeitas: 0,
    contratosDeAtendimento: 0,
    contratosFechados: 0,
    vendasFechadas: 0,
    vendasRegistradas: 0,
    valorVendas: 0,
    alugueisFechados: 0,
    alugueisAtribuidos: 0,
    alugueisAtivos: 0,
    alugueisEncerrados: 0,
    agenciamentosFeitos: 0,
    agenciamentosAtivos: 0,
    agenciamentosConcluidos: 0,
    agenciamentosAcoesPendentes: 0,
    agenciamentosComPlaca: 0,
    agenciamentosComFotos: 0,
    agenciamentosNoSite: 0,
    agenciamentosValidados: 0,
    agenciamentosChecklistPercent: 0,
    bonificacoesTotal: 0,
    bonificacoesPagas: 0,
    bonificacoesPendentes: 0,
    comissaoPrevista: 0,
    comissaoPaga: 0,
    comissaoMes: 0,
    comissaoPrevistaDisponivel: true,
    comissaoPagaDisponivel: true,
    taxaConversao: 0,
    mediaMensalContratos: 0,
    ticketMedio: 0,
    agendaHoje: 0,
    agendaProximos: 0,
    agendaConcluidos: 0,
    agendaPendentes: 0,
    mediaRespostaSegundos: null,
    medianaRespostaSegundos: null,
    respostaMaisRapidaSegundos: null,
    respostaMaisLentaSegundos: null,
    respostasMedidas: 0,
    respostasPendentes: 0,
    respostasForaDoPrazo: 0,
    atividadesRecentes: [],
  };
}

export function normalizeCorretor(input: LegacyCorretor): Corretor {
  const agencies =
    input.agencies?.filter(
      (agency): agency is "cordial" | "morar" => agency === "cordial" || agency === "morar",
    ) ?? [];
  const imobiliaria = normalizeAgency(input.imobiliaria);
  if (agencies.length === 0 && imobiliaria !== "ambas") agencies.push(imobiliaria);
  const paidCommission = asNullableNumber(input.comissaoPaga);
  return {
    ...createEmptyCorretor({
      id: input.id,
      nome: input.nome,
      iniciais: input.iniciais,
      agencies,
    }),
    ...input,
    agencies,
    imobiliaria,
    status: input.status ?? "ativo",
    atendimentosMes: asNumber(input.atendimentosMes),
    atendimentosRecebidos: asNumber(input.atendimentosRecebidos),
    atendimentosEmAndamento: asNumber(input.atendimentosEmAndamento),
    atendimentosConcluidos: asNumber(input.atendimentosConcluidos),
    visitasRealizadas: asNumber(input.visitasRealizadas),
    propostasFeitas: asNumber(input.propostasFeitas),
    contratosDeAtendimento: asNumber(input.contratosDeAtendimento),
    contratosFechados: asNumber(input.contratosFechados),
    vendasFechadas: asNumber(input.vendasFechadas),
    vendasRegistradas: asNumber(input.vendasRegistradas),
    valorVendas: asNumber(input.valorVendas),
    alugueisFechados: asNumber(input.alugueisFechados),
    alugueisAtribuidos: asNumber(input.alugueisAtribuidos),
    alugueisAtivos: asNumber(input.alugueisAtivos),
    alugueisEncerrados: asNumber(input.alugueisEncerrados),
    agenciamentosFeitos: asNumber(input.agenciamentosFeitos),
    agenciamentosAtivos: asNumber(input.agenciamentosAtivos),
    agenciamentosConcluidos: asNumber(input.agenciamentosConcluidos),
    agenciamentosAcoesPendentes: asNumber(input.agenciamentosAcoesPendentes),
    agenciamentosComPlaca: asNumber(input.agenciamentosComPlaca),
    agenciamentosComFotos: asNumber(input.agenciamentosComFotos),
    agenciamentosNoSite: asNumber(input.agenciamentosNoSite),
    agenciamentosValidados: asNumber(input.agenciamentosValidados),
    agenciamentosChecklistPercent: asNumber(input.agenciamentosChecklistPercent),
    bonificacoesTotal: asNumber(input.bonificacoesTotal),
    bonificacoesPagas: asNumber(input.bonificacoesPagas),
    bonificacoesPendentes: asNumber(input.bonificacoesPendentes),
    comissaoPrevista: asNumber(input.comissaoPrevista),
    comissaoPaga: paidCommission,
    comissaoMes: asNumber(input.comissaoMes),
    comissaoPrevistaDisponivel: input.comissaoPrevistaDisponivel ?? true,
    comissaoPagaDisponivel: input.comissaoPagaDisponivel ?? paidCommission != null,
    taxaConversao: clamp(asNumber(input.taxaConversao)),
    mediaMensalContratos: asNumber(input.mediaMensalContratos),
    ticketMedio: asNumber(input.ticketMedio),
    agendaHoje: asNumber(input.agendaHoje),
    agendaProximos: asNumber(input.agendaProximos),
    agendaConcluidos: asNumber(input.agendaConcluidos),
    agendaPendentes: asNumber(input.agendaPendentes),
    mediaRespostaSegundos: asNullableNumber(input.mediaRespostaSegundos),
    medianaRespostaSegundos: asNullableNumber(input.medianaRespostaSegundos),
    respostaMaisRapidaSegundos: asNullableNumber(input.respostaMaisRapidaSegundos),
    respostaMaisLentaSegundos: asNullableNumber(input.respostaMaisLentaSegundos),
    respostasMedidas: asNumber(input.respostasMedidas),
    respostasPendentes: asNumber(input.respostasPendentes),
    respostasForaDoPrazo: asNumber(input.respostasForaDoPrazo),
    atividadesRecentes: input.atividadesRecentes ?? [],
  };
}

export function normalizeCorretores(corretores: LegacyCorretor[]) {
  return corretores.map(normalizeCorretor);
}

export function buildCorretoresOperationalModel({
  periodo,
  agency,
  sources,
  sourceStatus = READY_SOURCES,
  now = new Date(),
  unattributedAttendances = 0,
}: {
  periodo: CorretorPeriodFilter;
  agency: AgencyFilter;
  sources: CorretoresOperationalSources;
  sourceStatus?: CorretorSourceStatus;
  now?: Date;
  unattributedAttendances?: number;
}): CorretoresOperationalResult {
  const range = getCorretorPeriodRange(periodo, now);
  const today = getCorretorPeriodRange("ultimos_30", now);
  const todayStart = new Date(today.end);
  const parts = saoPauloParts(now);
  todayStart.setTime(dateAtSaoPauloMidnight(parts.year, parts.month, parts.day).getTime());
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const rows = sources.roster
    .filter((profile) => profile.agencies.some((value) => isAgencyMatch(value, agency)))
    .map(createEmptyCorretor);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const attendancesById = new Map(sources.attendances.map((row) => [row.id, row]));
  const receivedByBroker = new Map<string, Set<string>>();
  const operationalByBroker = new Map<string, Set<string>>();
  const proposalsByBroker = new Map<string, Set<string>>();

  for (const assignment of sources.assignments) {
    const corretor = byId.get(assignment.brokerId);
    if (
      !corretor ||
      !isAgencyMatch(assignment.imobiliaria, agency) ||
      !isWithin(assignment.assignedAt, range)
    ) {
      continue;
    }
    const received = receivedByBroker.get(corretor.id) ?? new Set<string>();
    received.add(assignment.attendanceId);
    receivedByBroker.set(corretor.id, received);
    addActivity(corretor, {
      id: `assignment:${assignment.id}`,
      kind: "atendimento",
      title: "Atendimento recebido",
      detail:
        attendancesById.get(assignment.attendanceId)?.clienteNome ?? "Cliente não identificado",
      occurredAt: assignment.assignedAt,
      route: "/atendimentos",
    });
  }

  for (const attendance of sources.attendances) {
    const corretor = attendance.corretorId ? byId.get(attendance.corretorId) : undefined;
    if (
      !corretor ||
      !isAgencyMatch(attendance.imobiliaria, agency) ||
      (!isWithin(attendance.createdAt, range) && !isWithin(attendance.updatedAt, range))
    ) {
      continue;
    }
    const operational = operationalByBroker.get(corretor.id) ?? new Set<string>();
    operational.add(attendance.id);
    operationalByBroker.set(corretor.id, operational);
    if (isWithin(attendance.createdAt, range)) {
      const received = receivedByBroker.get(corretor.id) ?? new Set<string>();
      received.add(attendance.id);
      receivedByBroker.set(corretor.id, received);
    }
    const terminal =
      attendance.status === "fechado" ||
      attendance.pipelineStage === "fechamento" ||
      attendance.pipelineStage === "perdido" ||
      attendance.pipelineStage === "arquivado";
    if (terminal) corretor.atendimentosConcluidos += 1;
    else corretor.atendimentosEmAndamento += 1;
    if (attendance.status === "fechado" || attendance.pipelineStage === "fechamento") {
      corretor.contratosDeAtendimento += 1;
    }
    if (!corretor.ultimoAtendimentoEm || attendance.updatedAt > corretor.ultimoAtendimentoEm) {
      corretor.ultimoAtendimentoEm = attendance.updatedAt;
    }
    addActivity(corretor, {
      id: `attendance:${attendance.id}`,
      kind: "atendimento",
      title: terminal ? "Atendimento concluído" : "Atendimento em andamento",
      detail: attendance.clienteNome,
      occurredAt: attendance.updatedAt,
      route: "/atendimentos",
    });
  }

  for (const corretor of rows) {
    corretor.atendimentosRecebidos = receivedByBroker.get(corretor.id)?.size ?? 0;
    corretor.atendimentosMes = corretor.atendimentosRecebidos;
  }

  for (const history of sources.attendanceHistory) {
    const corretor = history.actorId ? byId.get(history.actorId) : undefined;
    if (
      !corretor ||
      !isAgencyMatch(history.imobiliaria, agency) ||
      !isWithin(history.createdAt, range)
    ) {
      continue;
    }
    const stage = stageFromHistory(history.newValue);
    if (stage !== "proposta" && stage !== "fechamento") continue;
    const proposed = proposalsByBroker.get(corretor.id) ?? new Set<string>();
    proposed.add(history.attendanceId);
    proposalsByBroker.set(corretor.id, proposed);
    addActivity(corretor, {
      id: `attendance-history:${history.id}`,
      kind: "atendimento",
      title: stage === "fechamento" ? "Atendimento em fechamento" : "Proposta registrada",
      detail: attendancesById.get(history.attendanceId)?.clienteNome ?? "Atendimento",
      occurredAt: history.createdAt,
      route: "/atendimentos",
    });
  }
  for (const corretor of rows) {
    corretor.propostasFeitas = proposalsByBroker.get(corretor.id)?.size ?? 0;
  }

  for (const event of sources.agenda) {
    if (!isAgencyMatch(event.imobiliaria, agency)) continue;
    const responsibleIds = new Set<string>();
    if (event.ownerId) responsibleIds.add(event.ownerId);
    for (const participant of event.participants) responsibleIds.add(participant.userId);
    for (const brokerId of responsibleIds) {
      const corretor = byId.get(brokerId);
      if (!corretor) continue;
      const occursInPeriod = isWithin(event.startsAt, range);
      const completedInPeriod = event.status === "concluido" && isWithin(event.completedAt, range);
      if (!occursInPeriod && !completedInPeriod) continue;
      const eventTime = new Date(event.startsAt).getTime();
      const pending = ["agendado", "confirmado", "em_andamento", "reagendado"].includes(
        event.status,
      );
      if (completedInPeriod) {
        corretor.agendaConcluidos += 1;
        if (event.type === "visita") corretor.visitasRealizadas += 1;
      }
      if (occursInPeriod && pending) {
        corretor.agendaPendentes += 1;
        if (eventTime >= now.getTime()) {
          corretor.agendaProximos += 1;
          if (
            !corretor.proximoCompromisso ||
            event.startsAt < corretor.proximoCompromisso.startsAt
          ) {
            corretor.proximoCompromisso = {
              id: event.id,
              title: event.title,
              startsAt: event.startsAt,
              status: event.status,
            };
          }
        }
      }
      if (
        occursInPeriod &&
        eventTime >= todayStart.getTime() &&
        eventTime < tomorrow.getTime() &&
        event.status !== "cancelado"
      ) {
        corretor.agendaHoje += 1;
      }
      addActivity(corretor, {
        id: `agenda:${event.id}`,
        kind: "agenda",
        title: event.title,
        detail:
          event.status === "concluido"
            ? "Compromisso concluído"
            : event.type === "visita"
              ? "Visita na agenda"
              : "Compromisso na agenda",
        occurredAt: event.completedAt ?? event.startsAt,
        route: "/agenda",
      });
    }
  }

  const checklistTotals = new Map<string, { completed: number; possible: number }>();
  for (const listing of sources.listings) {
    if (!isAgencyMatch(listing.imobiliaria, agency) || !isWithin(listing.date, range)) continue;
    const owner =
      (listing.brokerId && byId.has(listing.brokerId) ? listing.brokerId : null) ??
      (listing.createdBy && byId.has(listing.createdBy) ? listing.createdBy : null);
    if (!owner) continue;
    const corretor = byId.get(owner);
    if (!corretor) continue;
    corretor.agenciamentosFeitos += 1;
    if (listing.status === "validado") corretor.agenciamentosConcluidos += 1;
    else if (listing.status !== "cancelado") corretor.agenciamentosAtivos += 1;
    corretor.agenciamentosComFotos += listing.checklist[0] ? 1 : 0;
    corretor.agenciamentosComPlaca += listing.checklist[2] ? 1 : 0;
    corretor.agenciamentosNoSite += listing.checklist[3] ? 1 : 0;
    corretor.agenciamentosValidados += listing.checklist[5] ? 1 : 0;
    const completed = listing.checklist.filter(Boolean).length;
    corretor.agenciamentosAcoesPendentes += listing.checklist.length - completed;
    const checklist = checklistTotals.get(owner) ?? { completed: 0, possible: 0 };
    checklist.completed += completed;
    checklist.possible += listing.checklist.length;
    checklistTotals.set(owner, checklist);
    addActivity(corretor, {
      id: `listing:${listing.id}`,
      kind: "agenciamento",
      title: listing.status === "validado" ? "Agenciamento validado" : "Agenciamento atribuído",
      detail: listing.address,
      occurredAt: activityTimestamp(listing.date),
      route: "/agenciamentos",
    });
  }
  for (const corretor of rows) {
    const checklist = checklistTotals.get(corretor.id);
    corretor.agenciamentosChecklistPercent =
      checklist && checklist.possible > 0
        ? Math.round((checklist.completed / checklist.possible) * 100)
        : 0;
  }

  for (const bonus of sources.bonuses ?? []) {
    if (!bonus.brokerId) continue;
    const corretor = byId.get(bonus.brokerId);
    if (!corretor) continue;
    if (bonus.status === "cancelada") continue;
    corretor.bonificacoesTotal += 1;
    if (bonus.status === "paga") corretor.bonificacoesPagas += 1;
    else corretor.bonificacoesPendentes += 1;
  }

  const installmentsBySale = new Map<string, CorretorCommissionInstallmentRecord[]>();
  let unattributedSales = 0;
  let unattributedRentals = 0;
  for (const installment of sources.commissionInstallments) {
    const group = installmentsBySale.get(installment.saleId) ?? [];
    group.push(installment);
    installmentsBySale.set(installment.saleId, group);
  }
  const salesByBroker = new Map<string, number>();
  const configuredCommissions = new Map<string, number>();
  const commissionPlans = new Map<string, number>();
  for (const sale of sources.sales) {
    if (!isAgencyMatch(sale.imobiliaria, agency) || !isWithin(sale.date, range)) {
      continue;
    }
    if (!byId.has(sale.ownerId)) {
      unattributedSales += 1;
      continue;
    }
    const corretor = byId.get(sale.ownerId);
    if (!corretor) continue;
    corretor.vendasRegistradas += 1;
    salesByBroker.set(corretor.id, (salesByBroker.get(corretor.id) ?? 0) + 1);
    if (sale.status === "concluida") {
      corretor.vendasFechadas += 1;
      corretor.valorVendas += sale.value;
    }
    if (sale.commissionValue != null && Number.isFinite(sale.commissionValue)) {
      corretor.comissaoPrevista += sale.commissionValue;
      configuredCommissions.set(corretor.id, (configuredCommissions.get(corretor.id) ?? 0) + 1);
    }
    const installments = installmentsBySale.get(sale.id) ?? [];
    if (installments.length > 0) {
      commissionPlans.set(corretor.id, (commissionPlans.get(corretor.id) ?? 0) + 1);
      corretor.comissaoPaga =
        (corretor.comissaoPaga ?? 0) +
        installments.reduce(
          (total, installment) => total + (installment.paid ? installment.amount : 0),
          0,
        );
    }
    addActivity(corretor, {
      id: `sale:${sale.id}`,
      kind: "venda",
      title: sale.status === "concluida" ? "Venda concluída" : "Venda registrada",
      detail: sale.propertyName,
      occurredAt: activityTimestamp(sale.date),
      route: "/vendas",
    });
  }
  for (const corretor of rows) {
    const sales = salesByBroker.get(corretor.id) ?? 0;
    corretor.comissaoPrevistaDisponivel =
      sales === 0 || (configuredCommissions.get(corretor.id) ?? 0) === sales;
    corretor.comissaoPagaDisponivel =
      sales === 0 || (commissionPlans.get(corretor.id) ?? 0) === sales;
    if (!corretor.comissaoPagaDisponivel) corretor.comissaoPaga = null;
    corretor.comissaoMes = corretor.comissaoPrevista;
  }

  for (const rental of sources.rentals) {
    if (!isAgencyMatch(rental.brand, agency)) continue;
    const startsAt = timestampOf(rental.startsAt);
    const closedAt = rental.closedAt ? timestampOf(rental.closedAt) : null;
    const overlaps =
      Number.isFinite(startsAt) &&
      startsAt < range.end.getTime() &&
      (closedAt == null || closedAt >= range.start.getTime());
    const closedInPeriod = isWithin(rental.closedAt, range);
    const createdInPeriod = isWithin(rental.createdAt, range);
    if (!overlaps && !closedInPeriod && !createdInPeriod) continue;
    const corretor = byId.get(rental.createdBy);
    if (!corretor) {
      unattributedRentals += 1;
      continue;
    }
    corretor.alugueisAtribuidos += 1;
    if (rental.status === "ativo") corretor.alugueisAtivos += 1;
    if (rental.status === "encerrado" && closedInPeriod) corretor.alugueisEncerrados += 1;
    if (createdInPeriod) corretor.alugueisFechados += 1;
    addActivity(corretor, {
      id: `rental:${rental.id}`,
      kind: "aluguel",
      title: rental.status === "encerrado" ? "Aluguel encerrado" : "Aluguel atribuído",
      detail: `Contrato de ${rental.monthlyValue.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}/mês`,
      occurredAt: rental.closedAt ?? rental.createdAt,
      route: "/alugueis",
    });
  }

  for (const metric of sources.responses) {
    const corretor = byId.get(metric.brokerId);
    if (!corretor) continue;
    corretor.mediaRespostaSegundos = asNullableNumber(metric.averageSeconds);
    corretor.medianaRespostaSegundos = asNullableNumber(metric.medianSeconds);
    corretor.respostaMaisRapidaSegundos = asNullableNumber(metric.fastestSeconds);
    corretor.respostaMaisLentaSegundos = asNullableNumber(metric.slowestSeconds);
    corretor.respostasMedidas = asNumber(metric.completedCount);
    corretor.respostasPendentes = asNumber(metric.pendingCount);
    corretor.respostasForaDoPrazo = asNumber(metric.lateCount);
  }

  for (const corretor of rows) {
    corretor.contratosFechados = corretor.vendasFechadas + corretor.alugueisFechados;
    corretor.taxaConversao =
      corretor.atendimentosRecebidos > 0
        ? clamp(
            Math.round((corretor.contratosDeAtendimento / corretor.atendimentosRecebidos) * 100),
          )
        : 0;
    corretor.mediaMensalContratos = corretor.contratosFechados;
    corretor.ticketMedio =
      corretor.vendasFechadas > 0 ? Math.round(corretor.valorVendas / corretor.vendasFechadas) : 0;
    corretor.atividadesRecentes.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
    corretor.atividadesRecentes = corretor.atividadesRecentes.slice(0, 8);
    corretor.destaqueOperacional =
      corretor.mediaRespostaSegundos != null
        ? `${corretor.respostasMedidas} resposta${corretor.respostasMedidas === 1 ? "" : "s"} medida${
            corretor.respostasMedidas === 1 ? "" : "s"
          }`
        : corretor.agendaProximos > 0
          ? `${corretor.agendaProximos} compromisso${
              corretor.agendaProximos === 1 ? "" : "s"
            } próximo${corretor.agendaProximos === 1 ? "" : "s"}`
          : corretor.propostasFeitas > 0
            ? `${corretor.propostasFeitas} proposta${
                corretor.propostasFeitas === 1 ? "" : "s"
              } registrada${corretor.propostasFeitas === 1 ? "" : "s"}`
            : corretor.agenciamentosAtivos > 0
              ? `${corretor.agenciamentosAtivos} agenciamento${
                  corretor.agenciamentosAtivos === 1 ? "" : "s"
                } em execução`
              : "Sem atividade atribuída no período";
  }

  return {
    periodo,
    periodoInicio: range.start.toISOString(),
    periodoFim: range.end.toISOString(),
    generatedAt: now.toISOString(),
    rows,
    sourceStatus,
    unattributed: {
      sales: unattributedSales,
      rentals: unattributedRentals,
    },
  };
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
    trimestre: "Trimestre atual",
    ano: "Ano atual",
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

export function getCorretorSortLabel(sort: CorretorSortKey) {
  const labels: Record<CorretorSortKey, string> = {
    conversao: "Conversão de atendimentos",
    contratos: "Contratos fechados",
    atendimentos: "Atendimentos recebidos",
    comissao: "Comissão prevista",
    agenciamentos: "Agenciamentos",
    bonificacoes: "Bonificações conquistadas",
  };
  return labels[sort];
}

export function getAgenciamentoCompletion(corretor: Corretor) {
  return clamp(corretor.agenciamentosChecklistPercent);
}

export function filterCorretoresByAgency(corretores: Corretor[], agency: AgencyFilter) {
  if (agency === "todas") return corretores;
  return corretores.filter((corretor) => corretor.agencies.includes(agency));
}

export function getCorretorSortValue(corretor: Corretor, ordenacao: CorretorSortKey) {
  return sortAccessors[ordenacao](corretor);
}

export function sortCorretores(corretores: Corretor[], ordenacao: CorretorSortKey) {
  const accessor = sortAccessors[ordenacao];
  return [...corretores].sort((a, b) => {
    const aValue = accessor(a);
    const bValue = accessor(b);
    const primary = aValue === bValue ? 0 : bValue > aValue ? 1 : -1;
    if (primary !== 0) return primary;
    const activity =
      b.atendimentosRecebidos +
      b.agenciamentosFeitos +
      b.agendaConcluidos -
      (a.atendimentosRecebidos + a.agenciamentosFeitos + a.agendaConcluidos);
    if (activity !== 0) return activity;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function filterCorretores(
  corretores: Corretor[],
  agency: AgencyFilter,
  filters: Partial<CorretorFiltersState> = DEFAULT_FILTERS,
) {
  const nextFilters = { ...DEFAULT_FILTERS, ...filters };
  const query = nextFilters.busca.trim().toLocaleLowerCase("pt-BR");
  const filtered = filterCorretoresByAgency(corretores, agency).filter((corretor) => {
    const matchesStatus =
      nextFilters.status === "todos" ||
      (nextFilters.status === "ativos" && corretor.status === "ativo") ||
      (nextFilters.status === "inativos" && corretor.status === "inativo");
    const matchesBroker =
      nextFilters.corretorId === "todos" || corretor.id === nextFilters.corretorId;
    const matchesQuery =
      !query ||
      corretor.nome.toLocaleLowerCase("pt-BR").includes(query) ||
      corretor.creci.toLocaleLowerCase("pt-BR").includes(query);
    return matchesStatus && matchesBroker && matchesQuery;
  });
  return sortCorretores(filtered, nextFilters.ordenacao);
}

export function rankCorretores(corretores: Corretor[], criterion: CorretorSortKey = "contratos") {
  const sorted = sortCorretores(corretores, criterion);
  let previousValue: number | null = null;
  let previousRank = 0;
  return sorted.map((corretor, index) => {
    const value = getCorretorSortValue(corretor, criterion);
    if (!Number.isFinite(value) || value <= 0) {
      return { ...corretor, rankingPosicao: undefined };
    }
    const rank = previousValue === value ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return { ...corretor, rankingPosicao: rank };
  });
}

export function calculateCorretoresSummary(corretores: Corretor[]): CorretoresSummary {
  const summary: CorretoresSummary = {
    total: corretores.length,
    ativos: 0,
    atendimentosRecebidos: 0,
    atendimentosEmAndamento: 0,
    visitasRealizadas: 0,
    propostasFeitas: 0,
    contratosFechados: 0,
    vendasFechadas: 0,
    alugueisFechados: 0,
    agendaProximos: 0,
    agenciamentosFeitos: 0,
    agenciamentosChecklistPercent: 0,
    bonificacoesTotal: 0,
    bonificacoesPagas: 0,
    bonificacoesPendentes: 0,
    comissaoPrevista: 0,
    comissaoPrevistaDisponivel: true,
    comissaoPaga: 0,
    comissaoPagaDisponivel: true,
    comissaoPendente: 0,
    taxaMediaConversao: 0,
    ticketMedio: 0,
  };
  let checklistCompleted = 0;
  let checklistPossible = 0;
  let saleValue = 0;
  let paidAvailable = true;
  for (const corretor of corretores) {
    summary.ativos += corretor.status === "ativo" ? 1 : 0;
    summary.atendimentosRecebidos += corretor.atendimentosRecebidos;
    summary.atendimentosEmAndamento += corretor.atendimentosEmAndamento;
    summary.visitasRealizadas += corretor.visitasRealizadas;
    summary.propostasFeitas += corretor.propostasFeitas;
    summary.contratosFechados += corretor.contratosFechados;
    summary.vendasFechadas += corretor.vendasFechadas;
    summary.alugueisFechados += corretor.alugueisFechados;
    summary.agendaProximos += corretor.agendaProximos;
    summary.agenciamentosFeitos += corretor.agenciamentosFeitos;
    summary.bonificacoesTotal += corretor.bonificacoesTotal;
    summary.bonificacoesPagas += corretor.bonificacoesPagas;
    summary.bonificacoesPendentes += corretor.bonificacoesPendentes;
    summary.comissaoPrevista += corretor.comissaoPrevista;
    if (!corretor.comissaoPrevistaDisponivel) summary.comissaoPrevistaDisponivel = false;
    if (corretor.comissaoPagaDisponivel && corretor.comissaoPaga != null) {
      summary.comissaoPaga = (summary.comissaoPaga ?? 0) + corretor.comissaoPaga;
    } else {
      paidAvailable = false;
      summary.comissaoPagaDisponivel = false;
    }
    checklistCompleted += corretor.agenciamentosChecklistPercent * corretor.agenciamentosFeitos;
    checklistPossible += corretor.agenciamentosFeitos;
    saleValue += corretor.valorVendas;
  }
  summary.taxaMediaConversao =
    summary.atendimentosRecebidos > 0
      ? Math.round(
          (corretores.reduce((total, corretor) => total + corretor.contratosDeAtendimento, 0) /
            summary.atendimentosRecebidos) *
            100,
        )
      : 0;
  summary.agenciamentosChecklistPercent =
    checklistPossible > 0 ? Math.round(checklistCompleted / checklistPossible) : 0;
  summary.ticketMedio =
    summary.vendasFechadas > 0 ? Math.round(saleValue / summary.vendasFechadas) : 0;
  if (!paidAvailable) {
    summary.comissaoPaga = null;
    summary.comissaoPendente = null;
  } else {
    summary.comissaoPendente = Math.max(summary.comissaoPrevista - (summary.comissaoPaga ?? 0), 0);
  }
  return summary;
}

export function getCorretoresDashboardChart(corretores: Corretor[]): CorretorDashboardChartItem[] {
  return rankCorretores(corretores, "contratos")
    .filter((corretor) => corretor.rankingPosicao != null)
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
