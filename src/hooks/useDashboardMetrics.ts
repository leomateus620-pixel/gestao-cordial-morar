import { useMemo } from "react";
import { useAttendances, defaultAtendimentoFilters } from "@/hooks/useAttendances";
import { useAgenda, defaultAgendaFilters } from "@/hooks/useAgenda";
import { matchesTrack } from "@/lib/atendimentos/track";
import { ACTIVE_PIPELINE_STAGES, type Atendimento } from "@/types/atendimento";

const ACTIVE_STAGES = new Set(ACTIVE_PIPELINE_STAGES);

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function createdIn(atendimento: Atendimento, key: string) {
  const raw = atendimento.criadoEm;
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return monthKey(date) === key;
}

export type DashboardMetrics = {
  atendimentosMes: number;
  atendimentosMesAnterior: number;
  novosClientes: number;
  buscandoAluguel: number;
  buscandoCompra: number;
  visitasAgendadas: number;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Métricas do painel derivadas dos dados reais de Atendimentos e Agenda.
 * Como consome os mesmos hooks/caches dos módulos, os números se atualizam
 * automaticamente sempre que um registro é criado ou editado.
 */
export function useDashboardMetrics(): DashboardMetrics {
  const attendances = useAttendances("", defaultAtendimentoFilters);
  const agenda = useAgenda("", defaultAgendaFilters);

  return useMemo(() => {
    const now = new Date();
    const currentKey = monthKey(now);
    const previousKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const list = attendances.atendimentos;

    const atendimentosMes = list.filter((item) => createdIn(item, currentKey)).length;
    const atendimentosMesAnterior = list.filter((item) => createdIn(item, previousKey)).length;

    const novosClientes = list.filter(
      (item) => item.pipelineStage === "fechamento" && createdIn(item, currentKey),
    ).length;

    const ativos = list.filter((item) => ACTIVE_STAGES.has(item.pipelineStage));
    const buscandoAluguel = ativos.filter((item) => matchesTrack(item, "aluguel")).length;
    const buscandoCompra = ativos.filter((item) => matchesTrack(item, "venda")).length;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const visitasAgendadas = agenda.events.filter((event) => {
      if (event.tipo !== "visita") return false;
      if (event.status === "concluido" || event.status === "cancelado") return false;
      const start = new Date(event.inicio).getTime();
      return !Number.isNaN(start) && start >= todayStart;
    }).length;

    return {
      atendimentosMes,
      atendimentosMesAnterior,
      novosClientes,
      buscandoAluguel,
      buscandoCompra,
      visitasAgendadas,
      isLoading: attendances.isLoading || agenda.isLoading,
      isError: attendances.isError || agenda.isError,
    };
  }, [
    attendances.atendimentos,
    attendances.isLoading,
    attendances.isError,
    agenda.events,
    agenda.isLoading,
    agenda.isError,
  ]);
}
