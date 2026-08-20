import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useShallow } from "zustand/react/shallow";
import {
  calculateCorretoresSummary,
  filterCorretores,
  filterCorretoresByAgency,
  getCorretoresDashboardChart,
  getDefaultCorretorFilters,
  rankCorretores,
  type AgencyFilter,
} from "@/services/corretores";
import { getEquipePerformance, type EquipePerformanceResult } from "@/lib/equipe/equipe.functions";
import { useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import type { CorretorFiltersState, CorretorSourceStatus } from "@/types/corretor";

type UseCorretoresOptions = {
  initialFilters?: Partial<CorretorFiltersState>;
  agencyOverride?: AgencyFilter;
  skipDashboard?: boolean;
};

const EMPTY_SOURCE_STATUS: CorretorSourceStatus = {
  atendimentos: "ready",
  agenda: "ready",
  agenciamentos: "ready",
  vendas: "ready",
  alugueis: "ready",
  respostas: "ready",
  bonificacoes: "ready",
};

export function useCorretores(options: UseCorretoresOptions = {}) {
  const session = useSession();
  const { agency, setAgency } = useApp(
    useShallow((state) => ({
      agency: state.agency,
      setAgency: state.setAgency,
    })),
  );
  const [filters, setFilterState] = useState<CorretorFiltersState>(() => ({
    ...getDefaultCorretorFilters(),
    ...options.initialFilters,
  }));
  const effectiveAgency = options.agencyOverride ?? agency;
  const performanceFn = useServerFn(getEquipePerformance);
  const query = useQuery<EquipePerformanceResult>({
    queryKey: ["equipe-performance", session?.id ?? "anonymous", filters.periodo, effectiveAgency],
    queryFn: ({ signal }) => {
      if (signal.aborted) throw new DOMException("Consulta cancelada", "AbortError");
      return performanceFn({
        data: { periodo: filters.periodo, imobiliaria: effectiveAgency },
      });
    },
    enabled: Boolean(session) && !options.skipDashboard,
    staleTime: 30_000,
  });
  const allCorretores = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const agencyCorretores = useMemo(
    () => filterCorretoresByAgency(allCorretores, effectiveAgency),
    [allCorretores, effectiveAgency],
  );
  useEffect(() => {
    if (
      query.isFetching ||
      filters.corretorId === "todos" ||
      agencyCorretores.some((corretor) => corretor.id === filters.corretorId)
    ) {
      return;
    }
    setFilterState((current) => ({ ...current, corretorId: "todos" }));
  }, [agencyCorretores, filters.corretorId, query.isFetching]);
  const filteredCorretores = useMemo(
    () => filterCorretores(allCorretores, effectiveAgency, filters),
    [allCorretores, effectiveAgency, filters],
  );
  const ranking = useMemo(
    () => rankCorretores(filteredCorretores, filters.ordenacao),
    [filteredCorretores, filters.ordenacao],
  );
  const positions = useMemo(
    () => new Map(ranking.map((corretor) => [corretor.id, corretor.rankingPosicao])),
    [ranking],
  );
  const corretores = useMemo(
    () =>
      filteredCorretores.map((corretor) => ({
        ...corretor,
        rankingPosicao: positions.get(corretor.id),
      })),
    [filteredCorretores, positions],
  );
  const summary = useMemo(
    () => calculateCorretoresSummary(filteredCorretores),
    [filteredCorretores],
  );
  const dashboardCorretores = useMemo(
    () =>
      options.skipDashboard
        ? []
        : agencyCorretores.filter((corretor) => corretor.status === "ativo"),
    [agencyCorretores, options.skipDashboard],
  );
  const dashboardSummary = useMemo(
    () => calculateCorretoresSummary(dashboardCorretores),
    [dashboardCorretores],
  );
  const dashboardRanking = useMemo(
    () => rankCorretores(dashboardCorretores, "contratos"),
    [dashboardCorretores],
  );
  const dashboardChart = useMemo(
    () => getCorretoresDashboardChart(dashboardCorretores),
    [dashboardCorretores],
  );

  const updateFilters = useCallback((patch: Partial<CorretorFiltersState>) => {
    setFilterState((current) => ({ ...current, ...patch }));
  }, []);
  const resetFilters = useCallback(() => {
    setFilterState(getDefaultCorretorFilters());
  }, []);

  return {
    agency,
    setAgency,
    filters,
    setFilters: updateFilters,
    resetFilters,
    agencyCorretores,
    corretores,
    ranking,
    summary,
    dashboardSummary,
    dashboardRanking,
    dashboardChart,
    unattributed: query.data?.unattributed ?? { sales: 0, rentals: 0 },
    sourceStatus: query.data?.sourceStatus ?? EMPTY_SOURCE_STATUS,
    periodoInicio: query.data?.periodoInicio,
    periodoFim: query.data?.periodoFim,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
