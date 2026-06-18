import { useMemo } from "react";
import { useSession } from "@/lib/auth-mock";
import {
  agendaMatchesSearch,
  canEditAgendaEvent,
  createAgendaEvent,
  normalizeAgendaEvent,
  updateAgendaEvent,
} from "@/services/agenda";
import { useApp } from "@/store/app-store";
import type {
  AgendaEvent,
  AgendaEventInput,
  AgendaImobiliaria,
  AgendaPrioridade,
  AgendaStatus,
  AgendaTipo,
} from "@/types/agenda";

export type AgendaPeriod = "hoje" | "sete_dias" | "mes" | "todos" | "personalizado";

export type AgendaFilters = {
  periodo: AgendaPeriod;
  tipo: "todos" | AgendaTipo;
  status: "todos" | AgendaStatus;
  responsavel: "todos" | string;
  participante: "todos" | string;
  imobiliaria: "todas" | AgendaImobiliaria;
  prioridade: "todas" | AgendaPrioridade;
  cliente: "todos" | string;
  dataInicio: string;
  dataFim: string;
};

export const defaultAgendaFilters: AgendaFilters = {
  periodo: "todos",
  tipo: "todos",
  status: "todos",
  responsavel: "todos",
  participante: "todos",
  imobiliaria: "todas",
  prioridade: "todas",
  cliente: "todos",
  dataInicio: "",
  dataFim: "",
};

export function useAgenda(query: string, filters: AgendaFilters) {
  const user = useSession();
  const agency = useApp((state) => state.agency);
  const rawEvents = useApp((state) => state.agendaEvents);
  const clientes = useApp((state) => state.clientes);
  const corretores = useApp((state) => state.corretores);
  const imoveis = useApp((state) => state.imoveis);
  const upsertAgendaEvent = useApp((state) => state.upsertAgendaEvent);

  const events = useMemo(
    () =>
      rawEvents
        .map((event) => normalizeAgendaEvent(event, { clientes, corretores, imoveis }))
        .filter(
          (event) =>
            agency === "todas" || event.imobiliaria === agency || event.imobiliaria === "ambas",
        ),
    [agency, clientes, corretores, imoveis, rawEvents],
  );

  const filteredEvents = useMemo(
    () =>
      events
        .filter((event) => agendaMatchesSearch(event, query))
        .filter((event) => matchesFilters(event, filters))
        .sort((left, right) => left.inicio.localeCompare(right.inicio)),
    [events, filters, query],
  );

  const stats = useMemo(() => getAgendaStats(events), [events]);

  function createEvent(input: AgendaEventInput) {
    const event = createAgendaEvent(input, user);
    upsertAgendaEvent(event);
    return event;
  }

  function editEvent(current: AgendaEvent, input: AgendaEventInput) {
    if (!canEditAgendaEvent(current, user)) return undefined;
    const event = updateAgendaEvent(current, input, user);
    upsertAgendaEvent(event);
    return event;
  }

  return {
    events,
    filteredEvents,
    stats,
    createEvent,
    editEvent,
    canEdit: (event: AgendaEvent) => canEditAgendaEvent(event, user),
  };
}

function matchesFilters(event: AgendaEvent, filters: AgendaFilters) {
  if (filters.tipo !== "todos" && event.tipo !== filters.tipo) return false;
  if (filters.status !== "todos" && event.status !== filters.status) return false;
  if (filters.responsavel !== "todos" && event.responsavelPrincipalId !== filters.responsavel)
    return false;
  if (
    filters.participante !== "todos" &&
    !event.participantes.some((participant) => participant.userId === filters.participante)
  )
    return false;
  if (
    filters.imobiliaria !== "todas" &&
    event.imobiliaria !== filters.imobiliaria &&
    event.imobiliaria !== "ambas"
  )
    return false;
  if (filters.prioridade !== "todas" && event.prioridade !== filters.prioridade) return false;
  if (filters.cliente !== "todos" && event.clienteId !== filters.cliente) return false;
  return matchesPeriod(event, filters);
}

function matchesPeriod(event: AgendaEvent, filters: AgendaFilters) {
  if (filters.periodo === "todos") return true;
  const value = new Date(event.inicio);
  const now = new Date();
  const startToday = startOfDay(now);
  if (filters.periodo === "hoje") return isSameDay(value, now);
  if (filters.periodo === "sete_dias") {
    const end = new Date(startToday);
    end.setDate(end.getDate() + 7);
    return value >= startToday && value < end;
  }
  if (filters.periodo === "mes") {
    return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
  }
  if (filters.periodo === "personalizado") {
    const start = filters.dataInicio
      ? startOfDay(new Date(`${filters.dataInicio}T00:00:00`))
      : undefined;
    const end = filters.dataFim ? new Date(`${filters.dataFim}T23:59:59`) : undefined;
    return (!start || value >= start) && (!end || value <= end);
  }
  return true;
}

function getAgendaStats(events: AgendaEvent[]) {
  const now = new Date();
  const nextWeek = new Date(startOfDay(now));
  nextWeek.setDate(nextWeek.getDate() + 7);
  const active = events.filter((event) => event.status !== "cancelado");
  const pending = active.filter((event) => event.status !== "concluido");
  return {
    today: active.filter((event) => isSameDay(new Date(event.inicio), now)).length,
    nextSevenDays: active.filter((event) => {
      const date = new Date(event.inicio);
      return date >= startOfDay(now) && date < nextWeek;
    }).length,
    visits: active.filter((event) => event.tipo === "visita" && event.status !== "concluido")
      .length,
    returns: pending.filter((event) => event.tipo === "retorno").length,
    media: pending.filter((event) => event.tipo === "fotos" || event.tipo === "video").length,
    signatures: pending.filter((event) => event.tipo === "assinatura").length,
    pendingConfirmation: pending.filter((event) => event.status === "agendado").length,
  };
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
