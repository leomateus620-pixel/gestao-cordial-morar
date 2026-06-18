import type { MockUser } from "@/lib/auth-mock";
import type { Compromisso } from "@/lib/mock/data";
import {
  agendaStatusLabel,
  agendaTipoLabel,
  type AgendaChecklistItem,
  type AgendaEvent,
  type AgendaEventInput,
  type AgendaImobiliaria,
  type AgendaParticipant,
  type AgendaPrioridade,
  type AgendaReminder,
  type AgendaStatus,
  type AgendaTipo,
  type GoogleCalendarSyncStatus,
} from "@/types/agenda";

type NamedRecord = {
  id: string;
  nome?: string;
  fullName?: string;
  titulo?: string;
  endereco?: string;
};

export type AgendaNormalizeContext = {
  clientes?: NamedRecord[];
  corretores?: NamedRecord[];
  imoveis?: NamedRecord[];
};

type LegacyAgendaEvent = Partial<AgendaEvent> & {
  data?: string;
  corretorId?: string;
  tipo?: AgendaTipo | string;
  status?: AgendaStatus | string;
  imobiliaria?: AgendaImobiliaria | string;
};

export type AgendaValidationErrors = Partial<
  Record<"titulo" | "inicio" | "fim" | "duracao" | "responsavel", string>
>;

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function normalizeAgendaEvent(
  raw: LegacyAgendaEvent | Compromisso | unknown,
  context: AgendaNormalizeContext = {},
): AgendaEvent {
  const record = isRecord(raw) ? (raw as LegacyAgendaEvent) : {};
  const now = new Date().toISOString();
  const inicio = validIso(record.inicio) ?? validIso(record.data) ?? now;
  const duracaoMin =
    positiveNumber(record.duracaoMin) ?? inferDuration(record.inicio, record.fim) ?? 60;
  const responsavelPrincipalId = clean(record.responsavelPrincipalId) ?? clean(record.corretorId);
  const clienteId = clean(record.clienteId);
  const imovelId = clean(record.imovelId);
  const broker = context.corretores?.find((item) => item.id === responsavelPrincipalId);
  const client = context.clientes?.find((item) => item.id === clienteId);
  const property = context.imoveis?.find((item) => item.id === imovelId);

  return {
    id: clean(record.id) ?? id("agenda"),
    titulo: clean(record.titulo) ?? "Compromisso sem título",
    descricao: clean(record.descricao),
    tipo: normalizeAgendaTipo(record.tipo, record.titulo),
    status: normalizeAgendaStatus(record.status),
    prioridade: normalizeAgendaPrioridade(record.prioridade),
    inicio,
    fim: validIso(record.fim) ?? addMinutes(inicio, duracaoMin),
    duracaoMin,
    diaInteiro: Boolean(record.diaInteiro),
    repeticao: record.repeticao ?? "nao",
    imobiliaria: normalizeAgendaImobiliaria(record.imobiliaria),
    clienteId,
    clienteNome: clean(record.clienteNome) ?? recordName(client),
    atendimentoId: clean(record.atendimentoId),
    imovelId,
    imovelDescricao: clean(record.imovelDescricao) ?? property?.titulo,
    local: clean(record.local) ?? property?.endereco,
    videoCallUrl: clean(record.videoCallUrl),
    responsavelPrincipalId,
    responsavelPrincipalNome: clean(record.responsavelPrincipalNome) ?? recordName(broker),
    participantes: normalizeParticipants(record.participantes),
    lembretes: normalizeReminders(record.lembretes),
    checklist: normalizeChecklist(record.checklist),
    observacoes: clean(record.observacoes),
    criadoPorId: clean(record.criadoPorId) ?? responsavelPrincipalId,
    criadoPorNome: clean(record.criadoPorNome) ?? recordName(broker),
    atualizadoPorId: clean(record.atualizadoPorId),
    criadoEm: validIso(record.criadoEm) ?? now,
    atualizadoEm: validIso(record.atualizadoEm) ?? validIso(record.criadoEm) ?? now,
    googleCalendarSyncStatus: normalizeGoogleStatus(record.googleCalendarSyncStatus),
  };
}

export function createAgendaEvent(input: AgendaEventInput, user: MockUser | null): AgendaEvent {
  const timestamp = new Date().toISOString();
  return normalizeAgendaEvent({
    ...input,
    id: id("agenda"),
    criadoPorId: user?.id,
    criadoPorNome: user?.nome,
    atualizadoPorId: user?.id,
    criadoEm: timestamp,
    atualizadoEm: timestamp,
  });
}

export function updateAgendaEvent(
  current: AgendaEvent,
  input: AgendaEventInput,
  user: MockUser | null,
): AgendaEvent {
  return normalizeAgendaEvent({
    ...current,
    ...input,
    id: current.id,
    criadoPorId: current.criadoPorId,
    criadoPorNome: current.criadoPorNome,
    criadoEm: current.criadoEm,
    atualizadoPorId: user?.id,
    atualizadoEm: new Date().toISOString(),
  });
}

export function validateAgendaEvent(input: AgendaEventInput): AgendaValidationErrors {
  const errors: AgendaValidationErrors = {};
  if (!input.titulo.trim()) errors.titulo = "Informe um título.";
  const start = new Date(input.inicio);
  const end = input.fim ? new Date(input.fim) : undefined;
  if (Number.isNaN(start.getTime())) errors.inicio = "Informe data e horário válidos.";
  if (!input.diaInteiro && !input.inicio.includes("T")) {
    errors.inicio = "Informe o horário quando não for dia inteiro.";
  }
  if (end && Number.isNaN(end.getTime())) errors.fim = "Informe um horário final válido.";
  if (end && !Number.isNaN(start.getTime()) && end.getTime() <= start.getTime()) {
    errors.fim = "O horário final deve ser maior que o inicial.";
  }
  if (!end && (!input.duracaoMin || input.duracaoMin <= 0)) {
    errors.duracao = "A duração deve ser maior que zero.";
  }
  return errors;
}

export function agendaMatchesSearch(event: AgendaEvent, query: string) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const haystack = [
    event.titulo,
    event.descricao,
    event.clienteNome,
    event.responsavelPrincipalNome,
    ...event.participantes.map((participant) => participant.nome),
    event.imovelDescricao,
    event.local,
    agendaTipoLabel[event.tipo],
    agendaStatusLabel[event.status],
    event.observacoes,
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeSearch(haystack).includes(normalizedQuery);
}

export function canEditAgendaEvent(event: AgendaEvent, user: MockUser | null) {
  if (!user || !user.permissions.includes("agenda:write")) return false;
  if (user.perfil === "admin_owner") return true;
  const userName = normalizeSearch(user.nome);
  const matchesName = (name?: string) => {
    const normalized = normalizeSearch(name ?? "");
    return Boolean(normalized && (normalized.includes(userName) || userName.includes(normalized)));
  };
  return (
    event.criadoPorId === user.id ||
    event.responsavelPrincipalId === user.id ||
    matchesName(event.criadoPorNome) ||
    matchesName(event.responsavelPrincipalNome) ||
    event.participantes.some(
      (participant) => participant.userId === user.id || matchesName(participant.nome),
    )
  );
}

export function agendaTitleSuggestion(
  tipo: AgendaTipo,
  clientName?: string,
  propertyDescription?: string,
) {
  if (tipo === "retorno" && clientName) return `Retorno para ${firstName(clientName)}`;
  if (
    (tipo === "visita" || tipo === "fotos" || tipo === "video" || tipo === "vistoria") &&
    propertyDescription
  ) {
    return `${agendaTipoLabel[tipo]} ${propertyDescription}`;
  }
  return agendaTipoLabel[tipo];
}

export function toLegacyAgendaEvent(event: AgendaEvent): Compromisso {
  const typeMap: Record<AgendaTipo, Compromisso["tipo"]> = {
    visita: "Visita",
    fotos: "Visita",
    video: "Visita",
    assinatura: "Assinatura",
    reuniao: "Reunião",
    retorno: "Reunião",
    vistoria: "Vistoria",
    captacao: "Visita",
    interno: "Reunião",
    outro: "Reunião",
  };
  const statusMap: Record<AgendaStatus, NonNullable<Compromisso["status"]>> = {
    agendado: "Agendado",
    confirmado: "Confirmado",
    em_andamento: "Confirmado",
    concluido: "Concluído",
    cancelado: "Cancelado",
    reagendado: "Agendado",
  };
  return {
    id: event.id,
    titulo: event.titulo,
    tipo: typeMap[event.tipo],
    data: event.inicio,
    duracaoMin: event.duracaoMin ?? inferDuration(event.inicio, event.fim) ?? 60,
    clienteId: event.clienteId,
    imovelId: event.imovelId,
    corretorId: event.responsavelPrincipalId ?? "sem-responsavel",
    imobiliaria: event.imobiliaria,
    local: event.local,
    status: statusMap[event.status],
    observacoes: event.observacoes,
  };
}

function normalizeAgendaTipo(value: unknown, title?: unknown): AgendaTipo {
  const normalized = normalizeSearch(String(value ?? ""));
  const normalizedTitle = normalizeSearch(String(title ?? ""));
  if (normalizedTitle.includes("foto") || normalizedTitle.includes("fotografia")) return "fotos";
  if (normalizedTitle.includes("video")) return "video";
  if (normalizedTitle.includes("retorno")) return "retorno";
  if (normalized.includes("foto") || normalized.includes("fotografia")) return "fotos";
  if (normalized.includes("video")) return "video";
  if (normalized.includes("assin")) return "assinatura";
  if (normalized.includes("reun")) return "reuniao";
  if (normalized.includes("retorno")) return "retorno";
  if (normalized.includes("vistoria")) return "vistoria";
  if (normalized.includes("capt") || normalized.includes("agencia")) return "captacao";
  if (normalized.includes("intern")) return "interno";
  if (normalized.includes("visita")) return "visita";
  return normalized === "outro" ? "outro" : "visita";
}

function normalizeAgendaStatus(value: unknown): AgendaStatus {
  const normalized = normalizeSearch(String(value ?? ""));
  if (normalized.includes("confirm")) return "confirmado";
  if (normalized.includes("andamento")) return "em_andamento";
  if (normalized.includes("conclu")) return "concluido";
  if (normalized.includes("cancel")) return "cancelado";
  if (normalized.includes("reagend")) return "reagendado";
  return "agendado";
}

function normalizeAgendaPrioridade(value: unknown): AgendaPrioridade {
  const normalized = normalizeSearch(String(value ?? ""));
  if (normalized === "baixa" || normalized === "alta" || normalized === "urgente")
    return normalized;
  return "media";
}

function normalizeAgendaImobiliaria(value: unknown): AgendaImobiliaria {
  return value === "morar" || value === "ambas" ? value : "cordial";
}

function normalizeGoogleStatus(value: unknown): GoogleCalendarSyncStatus {
  if (value === "preparado" || value === "sincronizado") return value;
  return "nao_sincronizado";
}

function normalizeParticipants(value: unknown): AgendaParticipant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((participant, index) => ({
    userId: clean(participant.userId) ?? `participante-${index}`,
    nome: clean(participant.nome) ?? "Participante",
    papel:
      participant.papel === "responsavel" || participant.papel === "acompanhante"
        ? participant.papel
        : "participante",
  }));
}

function normalizeReminders(value: unknown): AgendaReminder[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((reminder, index) => ({
    id: clean(reminder.id) ?? `lembrete-${index}`,
    tipo: reminder.tipo === "email" || reminder.tipo === "whatsapp" ? reminder.tipo : "interno",
    antecedenciaMin: positiveNumber(reminder.antecedenciaMin) ?? 30,
    ativo: reminder.ativo !== false,
    canalFuturo: Boolean(reminder.canalFuturo),
  }));
}

function normalizeChecklist(value: unknown): AgendaChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item, index) => ({
    id: clean(item.id) ?? `check-${index}`,
    label: clean(item.label) ?? "Item do checklist",
    done: Boolean(item.done),
  }));
}

function validIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function inferDuration(start: unknown, end: unknown) {
  const startDate = typeof start === "string" ? new Date(start) : undefined;
  const endDate = typeof end === "string" ? new Date(end) : undefined;
  if (
    !startDate ||
    !endDate ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  )
    return undefined;
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60_000);
  return duration > 0 ? duration : undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordName(record?: NamedRecord) {
  return record?.nome ?? record?.fullName;
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
