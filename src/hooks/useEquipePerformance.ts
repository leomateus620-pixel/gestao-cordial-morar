import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEquipePerformance,
  type EquipeAgencyFilter,
  type EquipePeriodo,
  type EquipePerformanceResult,
} from "@/lib/equipe/equipe.functions";
import { useSession } from "@/lib/auth-mock";

type Options = {
  periodo?: EquipePeriodo;
  imobiliaria?: EquipeAgencyFilter;
  enabled?: boolean;
};

const EMPTY: EquipePerformanceResult = {
  periodo: "mes",
  periodoInicio: new Date().toISOString(),
  periodoFim: new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  rows: [],
  unattributed: { sales: 0, rentals: 0, attendances: 0 },
  sourceStatus: {
    atendimentos: "ready",
    agenda: "ready",
    agenciamentos: "ready",
    vendas: "ready",
    alugueis: "ready",
    respostas: "ready",
    bonificacoes: "ready",
  },
};

export function useEquipePerformance(options: Options = {}) {
  const session = useSession();
  const [periodo, setPeriodo] = useState<EquipePeriodo>(options.periodo ?? "mes");
  const imobiliaria: EquipeAgencyFilter = options.imobiliaria ?? "todas";
  const fn = useServerFn(getEquipePerformance);

  const query = useQuery<EquipePerformanceResult>({
    queryKey: ["equipe-performance", session?.id ?? "anonymous", periodo, imobiliaria],
    queryFn: () => fn({ data: { periodo, imobiliaria } }),
    enabled: Boolean(session) && options.enabled !== false,
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
