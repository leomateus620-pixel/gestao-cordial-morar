import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  calculateCorretoresSummary,
  filterCorretores,
  filterCorretoresByAgency,
  getCorretoresDashboardChart,
  getDefaultCorretorFilters,
  normalizeCorretores,
  rankCorretores,
  type AgencyFilter,
} from "@/services/corretores";
import { useApp } from "@/store/app-store";
import type { CorretorFiltersState } from "@/types/corretor";

type UseCorretoresOptions = {
  initialFilters?: Partial<CorretorFiltersState>;
  agencyOverride?: AgencyFilter;
};

export function useCorretores(options: UseCorretoresOptions = {}) {
  const { rawCorretores, agency, setAgency } = useApp(
    useShallow((state) => ({
      rawCorretores: state.corretores,
      agency: state.agency,
      setAgency: state.setAgency,
    })),
  );

  const [filters, setFilterState] = useState<CorretorFiltersState>(() => ({
    ...getDefaultCorretorFilters(),
    ...options.initialFilters,
  }));

  const effectiveAgency = options.agencyOverride ?? agency;

  const normalizedCorretores = useMemo(() => normalizeCorretores(rawCorretores), [rawCorretores]);

  const agencyCorretores = useMemo(
    () => filterCorretoresByAgency(normalizedCorretores, effectiveAgency),
    [effectiveAgency, normalizedCorretores],
  );

  const filteredCorretores = useMemo(
    () => filterCorretores(normalizedCorretores, effectiveAgency, filters),
    [effectiveAgency, filters, normalizedCorretores],
  );

  const ranking = useMemo(() => rankCorretores(filteredCorretores), [filteredCorretores]);

  const corretores = useMemo(() => {
    const positions = new Map(ranking.map((corretor) => [corretor.id, corretor.rankingPosicao]));
    return filteredCorretores.map((corretor) => ({
      ...corretor,
      rankingPosicao: positions.get(corretor.id),
    }));
  }, [filteredCorretores, ranking]);

  const summary = useMemo(
    () => calculateCorretoresSummary(filteredCorretores),
    [filteredCorretores],
  );

  const dashboardCorretores = useMemo(
    () => agencyCorretores.filter((corretor) => corretor.status === "ativo"),
    [agencyCorretores],
  );

  const dashboardSummary = useMemo(
    () => calculateCorretoresSummary(dashboardCorretores),
    [dashboardCorretores],
  );

  const dashboardRanking = useMemo(
    () => rankCorretores(dashboardCorretores),
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
  };
}
