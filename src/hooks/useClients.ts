import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-mock";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
} from "@/lib/clients/clients.functions";
import { useApp } from "@/store/app-store";
import { clientMatchesBrand, clientMatchesSearch, isClientCreatedThisMonth } from "@/services/clients";
import type {
  Client,
  ClientCreateInput,
  ClientPurpose,
  ClientStatus,
  ClientType,
  LeadOrigin,
  PropertyType,
} from "@/types/client";

export type ClientBudgetFilter = "todos" | "ate_300" | "300_700" | "700_1500" | "acima_1500";

export type ClientFilters = {
  clientType: "todos" | ClientType;
  purpose: "todos" | ClientPurpose;
  propertyType: "todos" | PropertyType;
  status: "todos" | ClientStatus;
  broker: "todos" | string;
  origin: "todos" | LeadOrigin;
  budget: ClientBudgetFilter;
};

export const defaultClientFilters: ClientFilters = {
  clientType: "todos",
  purpose: "todos",
  propertyType: "todos",
  status: "todos",
  broker: "todos",
  origin: "todos",
  budget: "todos",
};

export const CLIENTS_QUERY_KEY = ["clients"] as const;

export function useClients(query: string, filters: ClientFilters) {
  const user = useSession();
  const agency = useApp((state) => state.agency);
  const qc = useQueryClient();

  const clientsQuery = useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: () => listClients(),
    enabled: Boolean(user),
    staleTime: 15_000,
  });

  const clients: Client[] = clientsQuery.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: ClientCreateInput) => createClient({ data: input }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<ClientCreateInput> }) =>
      updateClient({ data: vars }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteClient({ data: { id } }),
    onSuccess: invalidate,
  });

  const brandClients = useMemo(
    () => clients.filter((client) => clientMatchesBrand(client, agency)),
    [agency, clients],
  );

  const filteredClients = useMemo(() => {
    return brandClients.filter((client) => {
      if (!clientMatchesSearch(client, query)) return false;
      if (filters.clientType !== "todos" && client.clientType !== filters.clientType) return false;
      if (filters.purpose !== "todos" && client.purpose !== filters.purpose) return false;
      if (filters.propertyType !== "todos" && client.propertyType !== filters.propertyType)
        return false;
      if (filters.status !== "todos" && client.status !== filters.status) return false;
      if (filters.broker !== "todos" && client.assignedBrokerId !== filters.broker) return false;
      if (filters.origin !== "todos" && client.leadOrigin !== filters.origin) return false;
      if (!matchesBudget(client, filters.budget)) return false;
      return true;
    });
  }, [brandClients, filters, query]);

  const stats = useMemo(() => getClientStats(brandClients), [brandClients]);

  return {
    agency,
    clients: brandClients,
    filteredClients,
    stats,
    isLoading: clientsQuery.isLoading,
    isError: clientsQuery.isError,
    error: clientsQuery.error as Error | null,
    isSaving: createMutation.isPending,
    addClient: (input: ClientCreateInput) => createMutation.mutateAsync(input),
    updateClient: updateMutation.mutateAsync,
    removeClient: removeMutation.mutateAsync,
    refetch: () => clientsQuery.refetch(),
  };
}

function getClientStats(clients: Client[]) {
  return {
    total: clients.length,
    newThisMonth: clients.filter((client) => isClientCreatedThisMonth(client)).length,
    rental: clients.filter((client) => client.purpose === "aluguel" || client.purpose === "ambos")
      .length,
    purchase: clients.filter((client) => client.purpose === "compra" || client.purpose === "ambos")
      .length,
    waiting: clients.filter((client) => client.status === "aguardando_retorno").length,
  };
}

function matchesBudget(client: Client, budget: ClientBudgetFilter) {
  if (budget === "todos") return true;
  const value = client.maxBudget ?? client.minBudget ?? 0;
  if (!value) return false;

  const rentalScale = client.purpose === "aluguel" || client.purpose === "locacao";
  if (budget === "ate_300") return rentalScale ? value <= 3000 : value <= 300000;
  if (budget === "300_700") {
    return rentalScale ? value > 3000 && value <= 7000 : value > 300000 && value <= 700000;
  }
  if (budget === "700_1500") {
    return rentalScale ? value > 7000 && value <= 15000 : value > 700000 && value <= 1500000;
  }
  return rentalScale ? value > 15000 : value > 1500000;
}
