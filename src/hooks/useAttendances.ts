import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-mock";
import {
  createAttendance,
  deleteAttendance,
  listAttendances,
  updateAttendance,
} from "@/lib/attendances/attendances.functions";
import { useApp } from "@/store/app-store";
import { atendimentoMatchesAgency, atendimentoMatchesSearch } from "@/services/atendimentos";
import type {
  Atendimento,
  AtendimentoCreateInput,
  AtendimentoFinalidade,
  AtendimentoStatus,
  OrigemLeadAtendimento,
  PrioridadeAtendimento,
  TipoImovelInteresse,
} from "@/types/atendimento";

export type AtendimentoPeriodFilter = "todos" | "hoje" | "sete_dias" | "mes";

export type AtendimentoFilters = {
  status: "todos" | AtendimentoStatus;
  finalidade: "todos" | AtendimentoFinalidade;
  tipoImovel: "todos" | TipoImovelInteresse;
  origem: "todos" | OrigemLeadAtendimento;
  corretor: "todos" | string;
  prioridade: "todos" | PrioridadeAtendimento;
  periodo: AtendimentoPeriodFilter;
};

export const defaultAtendimentoFilters: AtendimentoFilters = {
  status: "todos",
  finalidade: "todos",
  tipoImovel: "todos",
  origem: "todos",
  corretor: "todos",
  prioridade: "todos",
  periodo: "todos",
};

export const ATTENDANCES_QUERY_KEY = ["attendances"] as const;

export function useAttendances(query: string, filters: AtendimentoFilters) {
  const user = useSession();
  const agency = useApp((state) => state.agency);
  const qc = useQueryClient();

  const attendancesQuery = useQuery({
    queryKey: ATTENDANCES_QUERY_KEY,
    queryFn: () => listAttendances(),
    enabled: Boolean(user),
    staleTime: 15_000,
  });

  const atendimentos: Atendimento[] = attendancesQuery.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ATTENDANCES_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: AtendimentoCreateInput) => createAttendance({ data: input }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof updateAttendance>[0]["data"]["patch"] }) =>
      updateAttendance({ data: { id: vars.id, patch: vars.patch } }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteAttendance({ data: { id } }),
    onSuccess: invalidate,
  });

  const agencyAtendimentos = useMemo(
    () => atendimentos.filter((item) => atendimentoMatchesAgency(item, agency)),
    [agency, atendimentos],
  );

  const filteredAtendimentos = useMemo(
    () =>
      agencyAtendimentos.filter((item) => {
        if (!atendimentoMatchesSearch(item, query)) return false;
        if (filters.status !== "todos" && item.status !== filters.status) return false;
        if (filters.finalidade !== "todos" && item.finalidade !== filters.finalidade) return false;
        if (filters.tipoImovel !== "todos" && item.tipoImovel !== filters.tipoImovel) return false;
        if (filters.origem !== "todos" && item.origem !== filters.origem) return false;
        if (filters.prioridade !== "todos" && item.prioridade !== filters.prioridade) return false;
        if (filters.corretor !== "todos" && item.corretorId !== filters.corretor) return false;
        if (!matchesPeriod(item, filters.periodo)) return false;
        return true;
      }),
    [agencyAtendimentos, filters, query],
  );

  const stats = useMemo(() => getStats(agencyAtendimentos), [agencyAtendimentos]);

  return {
    agency,
    atendimentos: agencyAtendimentos,
    filteredAtendimentos,
    stats,
    isLoading: attendancesQuery.isLoading,
    isError: attendancesQuery.isError,
    error: attendancesQuery.error as Error | null,
    refetch: () => attendancesQuery.refetch(),
    isSaving: createMutation.isPending,
    addAtendimento: (input: AtendimentoCreateInput) => createMutation.mutateAsync(input),
    convertAtendimento: (id: string, clientId?: string) =>
      updateMutation.mutateAsync({
        id,
        patch: {
          convertidoEmCliente: true,
          clienteConvertidoId: clientId ?? null,
        },
      }),
    updateAtendimento: updateMutation.mutateAsync,
    removeAtendimento: removeMutation.mutateAsync,
  };
}

function getStats(atendimentos: Atendimento[]) {
  const status = atendimentos.reduce<Partial<Record<AtendimentoStatus, number>>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  const budgetValues = atendimentos
    .map((item) => {
      if (item.orcamentoMin && item.orcamentoMax) {
        return (item.orcamentoMin + item.orcamentoMax) / 2;
      }
      return item.orcamentoMax ?? item.orcamentoMin;
    })
    .filter((value): value is number => typeof value === "number" && value > 0);
  const now = new Date();

  return {
    status,
    compra: atendimentos.filter((i) => i.finalidade === "compra" || i.finalidade === "ambos").length,
    aluguel: atendimentos.filter((i) => i.finalidade === "aluguel" || i.finalidade === "ambos").length,
    ticketMedio: budgetValues.length
      ? budgetValues.reduce((total, value) => total + value, 0) / budgetValues.length
      : 0,
    leadsMes: atendimentos.filter((i) => {
      const created = new Date(i.criadoEm);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length,
  };
}

function matchesPeriod(item: Atendimento, period: AtendimentoPeriodFilter) {
  if (period === "todos") return true;
  const created = new Date(item.criadoEm);
  if (Number.isNaN(created.getTime())) return false;
  const now = new Date();
  if (period === "hoje") return created.toDateString() === now.toDateString();
  if (period === "sete_dias") return now.getTime() - created.getTime() <= 7 * 24 * 60 * 60 * 1000;
  return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
}
