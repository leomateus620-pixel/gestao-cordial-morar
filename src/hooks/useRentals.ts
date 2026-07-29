import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  closeRentalContract as closeFn,
  createRentalContract as createFn,
  deleteRentalContract as deleteFn,
  getRentalKpis as kpisFn,
  listRentalContracts,
  listRentalProperties,
  listRentalTenants,
  markRentalPaymentPaid as markPaidFn,
  renewRentalContract as renewFn,
  replaceRentalContract as replaceFn,
  updateRentalContract as updateFn,
} from "@/lib/rentals/rentals.functions";
import { useApp } from "@/store/app-store";
import type {
  RentalBrand,
  RentalContractFull,
  RentalContractInput,
  RentalFilter,
  RentalKpis,
  RentalPeriodFilter,
} from "@/types/rental";

type UseRentalsOptions = {
  initialFilter?: RentalFilter;
  corretorId?: string;
  periodo?: RentalPeriodFilter;
  imobiliaria?: "todas" | Exclude<RentalBrand, "ambas">;
};

export function useRentals(options: UseRentalsOptions = {}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listRentalContracts);
  const kpis = useServerFn(kpisFn);
  const create = useServerFn(createFn);
  const update = useServerFn(updateFn);
  const replace = useServerFn(replaceFn);
  const close = useServerFn(closeFn);
  const renew = useServerFn(renewFn);
  const markPaid = useServerFn(markPaidFn);
  const remove = useServerFn(deleteFn);
  const lookupProps = useServerFn(listRentalProperties);
  const lookupTenants = useServerFn(listRentalTenants);

  const contractsQuery = useQuery<RentalContractFull[]>({
    queryKey: ["rentals", "contracts"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const kpisQuery = useQuery<RentalKpis>({
    queryKey: ["rentals", "kpis"],
    queryFn: () => kpis(),
    staleTime: 30_000,
  });

  const propsQuery = useQuery({
    queryKey: ["rentals", "properties"],
    queryFn: () => lookupProps(),
    staleTime: 60_000,
  });
  const tenantsQuery = useQuery({
    queryKey: ["rentals", "tenants"],
    queryFn: () => lookupTenants(),
    staleTime: 60_000,
  });

  const invalidate = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rentals"] }),
        queryClient.invalidateQueries({ queryKey: ["equipe-performance"] }),
      ]),
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: (input: RentalContractInput) => create({ data: input }),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: (vars: Parameters<typeof update>[0]["data"]) => update({ data: vars }),
    onSuccess: invalidate,
  });
  const closeMutation = useMutation({
    mutationFn: (id: string) => close({ data: { id } }),
    onSuccess: invalidate,
  });
  const renewMutation = useMutation({
    mutationFn: (vars: { id: string; novaDataFim: string }) => renew({ data: vars }),
    onSuccess: invalidate,
  });
  const payMutation = useMutation({
    mutationFn: (id: string) => markPaid({ data: { id } }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });
  const replaceMutation = useMutation({
    mutationFn: (input: RentalContractInput & { contractId: string }) => replace({ data: input }),
    onSuccess: invalidate,
  });

  const [filter, setFilter] = useState<RentalFilter>(options.initialFilter ?? "todos");
  const [search, setSearch] = useState("");
  const selectedAgency = useApp((s) => s.agency);
  const agency = options.imobiliaria ?? selectedAgency;

  useEffect(() => {
    setFilter(options.initialFilter ?? "todos");
  }, [options.initialFilter]);

  const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);
  const filtered = useMemo(() => {
    const today = new Date();
    return contracts.filter((c) => {
      if (agency !== "todas" && c.brand !== agency && c.brand !== "ambas") return false;
      if (options.corretorId && c.createdById !== options.corretorId) return false;
      if (!matchesRentalPeriod(c, options.periodo ?? "todos", today)) return false;
      // status filter
      if (filter !== "todos") {
        if (filter === "ativos" && c.status !== "ativo") return false;
        if (filter === "pendentes" && c.status !== "pendente_assinatura") return false;
        if (filter === "vencidos" && c.status !== "vencido") return false;
        if (filter === "encerrados" && c.status !== "encerrado" && c.status !== "cancelado")
          return false;
        if (filter === "atrasados" && c.paymentStatus !== "atrasado") return false;
      }
      // search
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [
          c.property.apelido,
          c.property.bairro ?? "",
          c.property.cidade ?? "",
          c.property.logradouro,
          c.tenant.nome,
          c.status,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      void today;
      return true;
    });
  }, [agency, contracts, filter, options.corretorId, options.periodo, search]);
  const hasOperationalContext = Boolean(
    options.corretorId || options.periodo || options.imobiliaria || options.initialFilter,
  );
  const contextualKpis = useMemo<RentalKpis | undefined>(() => {
    if (!hasOperationalContext) return kpisQuery.data;
    const today = new Date();
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const active = filtered.filter((contract) => contract.status === "ativo");
    const receita = active.reduce(
      (total, contract) => total + (Number(contract.valorMensal) || 0),
      0,
    );
    const comissao = active.reduce(
      (total, contract) => total + (Number(contract.comissaoMensal) || 0),
      0,
    );
    return {
      receitaMensalAtiva: receita,
      comissaoMensalAtiva: comissao,
      comissaoPercentualMedio: receita > 0 ? (comissao / receita) * 100 : 0,
      contratosAtivos: active.length,
      contratosPendentes: filtered.filter((contract) => contract.status === "pendente_assinatura")
        .length,
      vencendoEm30: active.filter((contract) => {
        const end = new Date(`${contract.dataFim}T12:00:00`);
        return end >= today && end <= in30Days;
      }).length,
      atrasos: filtered.filter((contract) => contract.paymentStatus === "atrasado").length,
      imoveisDisponiveis: kpisQuery.data?.imoveisDisponiveis ?? 0,
    };
  }, [filtered, hasOperationalContext, kpisQuery.data]);

  return {
    contracts: filtered,
    allContracts: contracts,
    kpis: contextualKpis,
    properties: propsQuery.data ?? [],
    tenants: tenantsQuery.data ?? [],
    isLoading: contractsQuery.isLoading,
    isError: contractsQuery.isError,
    error: contractsQuery.error,
    filter,
    setFilter,
    search,
    setSearch,
    createRental: (input: RentalContractInput) => createMutation.mutateAsync(input),
    updateRental: updateMutation.mutateAsync,
    replaceRental: (input: RentalContractInput & { contractId: string }) =>
      replaceMutation.mutateAsync(input),
    saveRental: (input: RentalContractInput) =>
      input.contractId
        ? replaceMutation.mutateAsync(input as RentalContractInput & { contractId: string })
        : createMutation.mutateAsync(input),
    closeRental: (id: string) => closeMutation.mutateAsync(id),
    renewRental: (id: string, novaDataFim: string) =>
      renewMutation.mutateAsync({ id, novaDataFim }),
    markPaid: (id: string) => payMutation.mutateAsync(id),
    deleteRental: (id: string) => deleteMutation.mutateAsync(id),
    isSaving:
      createMutation.isPending ||
      updateMutation.isPending ||
      replaceMutation.isPending ||
      closeMutation.isPending ||
      renewMutation.isPending ||
      payMutation.isPending ||
      deleteMutation.isPending,
  };
}

function matchesRentalPeriod(contract: RentalContractFull, period: RentalPeriodFilter, now: Date) {
  if (period === "todos") return true;
  const startsAt = new Date(`${contract.dataInicio}T12:00:00`);
  const endsAt = new Date(`${contract.dataEncerramento ?? contract.dataFim}T12:00:00`);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return false;
  let start: Date;
  let end: Date;
  if (period === "ultimos_30") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (period === "trimestre") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterMonth, 1);
    end = new Date(now.getFullYear(), quarterMonth + 3, 1);
  } else if (period === "ano") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  return startsAt < end && endsAt >= start;
}
