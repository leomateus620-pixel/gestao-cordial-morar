import { useCallback, useMemo, useState } from "react";
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
import type {
  RentalContractFull,
  RentalContractInput,
  RentalFilter,
  RentalKpis,
} from "@/types/rental";

export function useRentals() {
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

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["rentals"] });
  }, [queryClient]);

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

  const [filter, setFilter] = useState<RentalFilter>("todos");
  const [search, setSearch] = useState("");

  const contracts = contractsQuery.data ?? [];
  const filtered = useMemo(() => {
    const today = new Date();
    return contracts.filter((c) => {
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
  }, [contracts, filter, search]);

  return {
    contracts: filtered,
    allContracts: contracts,
    kpis: kpisQuery.data,
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
    closeRental: (id: string) => closeMutation.mutateAsync(id),
    renewRental: (id: string, novaDataFim: string) =>
      renewMutation.mutateAsync({ id, novaDataFim }),
    markPaid: (id: string) => payMutation.mutateAsync(id),
    deleteRental: (id: string) => deleteMutation.mutateAsync(id),
    isSaving:
      createMutation.isPending ||
      updateMutation.isPending ||
      closeMutation.isPending ||
      renewMutation.isPending ||
      payMutation.isPending ||
      deleteMutation.isPending,
  };
}
