import type { Atendimento } from "@/types/atendimento";
import type { AgendaEvent } from "@/types/agenda";
import { buildDashboardMetrics, type DashboardPeriods } from "@/lib/dashboard/metrics";
const now = new Date("2026-11-15T15:00:00Z");
const attendances = Array.from({ length: 364 }, (_, index) => ({
  criadoEm: new Date(
    Date.UTC(
      2026,
      5 + (Math.floor(index / 7) % 6),
      1 + ((index * 11 + Math.floor(index / 17)) % (Math.floor(index / 7) % 6 === 5 ? 15 : 28)),
      12,
    ),
  ).toISOString(),
  pipelineStage: index % 23 === 0 ? "fechamento" : "primeiro_contato",
  finalidade: index % 3 === 0 ? "aluguel" : "compra",
  imobiliaria: index % 4 === 0 ? "morar" : "cordial",
})) as Atendimento[];
const events = Array.from({ length: 18 }, (_, index) => ({
  inicio: `2026-11-${String(15 + (index % 14)).padStart(2, "0")}T14:00:00-03:00`,
  tipo: "visita",
  status: "agendado",
  imobiliaria: "cordial",
})) as AgendaEvent[];
export function useDashboardMetrics(periods: DashboardPeriods) {
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state");
  const agency = params.get("agency") === "morar" ? "morar" : "todas";
  const cards = buildDashboardMetrics(
    state === "empty" ? [] : attendances,
    state === "empty" ? [] : events,
    periods,
    now,
    agency,
  );
  const retry = () => {
    const url = new URL(location.href);
    url.searchParams.delete("state");
    location.href = url.toString();
  };
  return {
    cards,
    attendanceState: { isLoading: state === "loading", isError: state === "error" },
    agendaState: {
      isLoading: state === "loading",
      isError: state === "error" || state === "agenda-error",
    },
    retryAttendances: retry,
    retryAgenda: retry,
  };
}
