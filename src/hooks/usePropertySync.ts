import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  enqueuePropertySync,
  getPropertySyncStatus,
  getProvidersHealth,
  listProviderCatalog,
  refreshProviderCatalogs,
  type EnqueueSyncInput,
  type PublicationStatusView,
} from "@/lib/imoveis/publish.functions";

export function usePropertySyncStatus(propertyId: string | undefined) {
  const get = useServerFn(getPropertySyncStatus);
  return useQuery<PublicationStatusView[]>({
    queryKey: ["property-sync", propertyId],
    queryFn: () => get({ data: { propertyId: propertyId as string } }),
    enabled: !!propertyId,
    // O processamento não depende da tela. Enquanto aberta, ela acompanha
    // inclusive a recuperação de um bloqueio corrigido após o último fetch.
    refetchInterval: 15_000,
  });
}

export function useEnqueuePropertySync(propertyId?: string) {
  const qc = useQueryClient();
  const enqueue = useServerFn(enqueuePropertySync);
  return useMutation({
    mutationFn: (input: EnqueueSyncInput) => enqueue({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-sync", propertyId] });
      qc.invalidateQueries({ queryKey: ["imoveis"] });
    },
  });
}

export function useProvidersHealth(enabled = true) {
  const health = useServerFn(getProvidersHealth);
  return useQuery({
    queryKey: ["providers-health"],
    queryFn: () => health(),
    enabled,
    staleTime: 60_000,
  });
}

export function useRefreshProviderCatalogs() {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshProviderCatalogs);
  return useMutation({
    mutationFn: (input: { provider: string }) => refresh({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["provider-catalog"] }),
  });
}

export function useProviderCatalog(
  provider: string | null,
  kind: "city" | "property_type" | "characteristic",
) {
  const list = useServerFn(listProviderCatalog);
  return useQuery({
    queryKey: ["provider-catalog", provider, kind],
    queryFn: () => list({ data: { provider: provider as string, kind } }),
    enabled: !!provider,
    staleTime: 10 * 60_000,
  });
}
