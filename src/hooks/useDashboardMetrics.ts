import { useMemo } from "react";
import { useAttendances, defaultAtendimentoFilters } from "@/hooks/useAttendances";
import { useAgenda, defaultAgendaFilters } from "@/hooks/useAgenda";
import { useApp } from "@/store/app-store";
import { buildDashboardMetrics, type DashboardPeriods } from "@/lib/dashboard/metrics";

/** Reuses the authenticated module caches and their agency/access scope. */
export function useDashboardMetrics(periods: DashboardPeriods) {
  const attendances = useAttendances("", defaultAtendimentoFilters);
  const agenda = useAgenda("", defaultAgendaFilters);
  const agency = useApp((state) => state.agency);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );

  const cards = useMemo(
    () =>
      buildDashboardMetrics(
        attendances.atendimentos,
        agenda.events,
        periods,
        new Date(`${today}T12:00:00-03:00`),
        agency,
      ),
    [attendances.atendimentos, agenda.events, periods, agency, today],
  );

  return {
    cards,
    attendanceState: { isLoading: attendances.isLoading, isError: attendances.isError },
    agendaState: { isLoading: agenda.isLoading, isError: agenda.isError },
    retryAttendances: attendances.refetch,
    retryAgenda: agenda.refetch,
  };
}
