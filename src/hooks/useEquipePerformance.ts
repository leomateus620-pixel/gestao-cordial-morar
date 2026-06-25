import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEquipePerformance,
  type EquipeAgencyFilter,
  type EquipePeriodo,
  type EquipePerformanceResult,
} from "@/lib/equipe/equipe.functions";

type Options = {
  periodo?: EquipePeriodo;
  imobiliaria?: EquipeAgencyFilter;
  enabled?: boolean;
};

const EMPTY: EquipePerformanceResult = {
  periodo: "mes",
  periodoInicio: new Date().toISOString(),
  rows: [],
  totals: { atendimentos: 0, contratos: 0, agenciamentos: 0, conversaoMedia: 0 },
};

export function useEquipePerformance(options: Options = {}) {
  const [periodo, setPeriodo] = useState<EquipePeriodo>(options.periodo ?? "mes");
  const imobiliaria: EquipeAgencyFilter = options.imobiliaria ?? "todas";
  const fn = useServerFn(getEquipePerformance);

  const query = useQuery<EquipePerformanceResult>({
    queryKey: ["equipe-performance", periodo, imobiliaria],
    queryFn: () => fn({ data: { periodo, imobiliaria } }),
    enabled: options.enabled !== false,
    staleTime: 30_000,
  });

  const data = useMemo(() => query.data ?? EMPTY, [query.data]);

  return {
    periodo,
    setPeriodo,
    data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}
