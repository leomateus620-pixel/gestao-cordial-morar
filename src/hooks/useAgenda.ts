import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-mock";
import {
  listAgendaEvents,
  upsertAgendaEvent,
  softDeleteAgendaEvent,
  completeAgendaEvent,
} from "@/lib/agenda/agenda.functions";
import { agendaMatchesSearch, canEditAgendaEvent } from "@/services/agenda";
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
  corretorContexto: "todos" | string;
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
  corretorContexto: "todos",
  responsavel: "todos",
  participante: "todos",
  imobiliaria: "todas",
  prioridade: "todas",
  cliente: "todos",
  dataInicio: "",
  dataFim: "",
};

export type AgendaScope = "todos" | "geral" | "fotos";

export const AGENDA_QUERY_KEY = ["agenda", "events"] as const;
export const agendaQueryKey = (scope: AgendaScope = "todos") =>
  ["agenda", "events", scope] as const;

export function useAgenda(
  query: string,
  filters: AgendaFilters,
  options: { scope?: AgendaScope } = {},
) {
  const scope = options.scope ?? "todos";
  const user = useSession();
  const qc = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: agendaQueryKey(scope),
    queryFn: () => listAgendaEvents({ data: { scope } }),
    enabled: Boolean(user),
    staleTime: 15_000,
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  const filteredEvents = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    return events
      .filter((event) => agendaMatchesSearch(event, query))
      .filter((event) => matchesFilters(event, filters))
      .sort((a, b) => {
        const aTime = new Date(a.inicio).getTime();
        const bTime = new Date(b.inicio).getTime();
        const aPast = aTime < todayStart;
        const bPast = bTime < todayStart;
        // Atual/futuro primeiro (crescente); histórico depois (mais recente primeiro).
        if (aPast !== bPast) return aPast ? 1 : -1;
        return aPast ? bTime - aTime : aTime - bTime;
      });
  }, [events, filters, query]);


  const stats = useMemo(
    () => (scope === "fotos" ? getPhotoStats(filteredEvents) : getAgendaStats(filteredEvents)),
    [filteredEvents, scope],
  );

  // Invalidate every agenda view (geral + fotos + todos) so mutations propagate.
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["agenda", "events"] }),
      qc.invalidateQueries({ queryKey: ["equipe-performance"] }),
    ]);

  const upsert = useMutation({
    mutationFn: (payload: { id?: string; input: AgendaEventInput }) =>
      upsertAgendaEvent({ data: payload }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => softDeleteAgendaEvent({ data: { id } }),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: (id: string) => completeAgendaEvent({ data: { id } }),
    onSuccess: invalidate,
  });

  async function createEvent(input: AgendaEventInput) {
    return upsert.mutateAsync({ input });
  }
  async function editEvent(current: AgendaEvent, input: AgendaEventInput) {
    if (!canEditAgendaEvent(current, user)) return undefined;
    return upsert.mutateAsync({ id: current.id, input });
  }
  async function deleteEvent(id: string) {
    return remove.mutateAsync(id);
  }
  async function completeEvent(id: string) {
    return complete.mutateAsync(id);
  }

  return {
    events,
    filteredEvents,
    stats,
    isLoading: eventsQuery.isLoading,
    /** True somente após uma carga concluída com sucesso. */
    isReady: eventsQuery.isSuccess,
    dataUpdatedAt: eventsQuery.dataUpdatedAt,
    isError: eventsQuery.isError,
    error: eventsQuery.error as Error | null,
    refetch: () => eventsQuery.refetch(),
    isSaving: upsert.isPending,
    createEvent,
    editEvent,
    deleteEvent,
    completeEvent,
    canEdit: (event: AgendaEvent) => canEditAgendaEvent(event, user),
  };
}

function matchesFilters(event: AgendaEvent, filters: AgendaFilters) {
  if (filters.tipo !== "todos" && event.tipo !== filters.tipo) return false;
  if (filters.status !== "todos" && event.status !== filters.status) return false;
  if (
    filters.corretorContexto !== "todos" &&
    event.responsavelPrincipalId !== filters.corretorContexto &&
    !event.participantes.some((participant) => participant.userId === filters.corretorContexto)
  )
    return false;
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
    signatures: pending.filter((event) => event.tipo === "assinatura").length,
    pendingConfirmation: pending.filter((event) => event.status === "agendado").length,
  };
}

function getPhotoStats(events: AgendaEvent[]) {
  const now = new Date();
  const nextWeek = new Date(startOfDay(now));
  nextWeek.setDate(nextWeek.getDate() + 7);
  const active = events.filter((event) => event.status !== "cancelado");
  return {
    today: active.filter((event) => isSameDay(new Date(event.inicio), now)).length,
    nextSevenDays: active.filter((event) => {
      const date = new Date(event.inicio);
      return date >= startOfDay(now) && date < nextWeek;
    }).length,
    agendadas: active.filter(
      (event) => event.status === "agendado" || event.status === "confirmado",
    ).length,
    pendentes: active.filter(
      (event) => event.status === "agendado" || event.status === "em_andamento",
    ).length,
    concluidas: active.filter((event) => event.status === "concluido").length,
    reagendadas: active.filter((event) => event.status === "reagendado").length,
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
