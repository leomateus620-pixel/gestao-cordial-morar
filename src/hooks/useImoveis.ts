import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createImovel,
  getImovel,
  getImoveisFacets,
  getPropertyDetail,
  listImoveis,
  updateImovel,
  type CreateImovelInput,
  type ListImoveisInput,
  type UpdateImovelInput,
} from "@/lib/imoveis/imoveis.functions";
import type { Property, PropertyDetail } from "@/types/property";

export function useImoveisList(filters: ListImoveisInput) {
  const list = useServerFn(listImoveis);
  return useQuery({
    queryKey: ["imoveis", filters],
    queryFn: () => list({ data: filters }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useImovel(id: string | undefined) {
  const get = useServerFn(getImovel);
  return useQuery<Property | null>({
    queryKey: ["imovel", id],
    queryFn: () => get({ data: { id: id as string } }),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function usePropertyDetail(id: string | undefined) {
  const get = useServerFn(getPropertyDetail);
  return useQuery<PropertyDetail | null>({
    queryKey: ["imovel-detalhe", id],
    queryFn: () => get({ data: { id: id as string } }),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useImoveisFacets() {
  const facets = useServerFn(getImoveisFacets);
  return useQuery({
    queryKey: ["imoveis-facets"],
    queryFn: () => facets(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateImovel() {
  const qc = useQueryClient();
  const create = useServerFn(createImovel);
  return useMutation({
    mutationFn: (input: CreateImovelInput) => create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imoveis"] });
      qc.invalidateQueries({ queryKey: ["imoveis-facets"] });
    },
  });
}

export function useUpdateImovel(id?: string) {
  const qc = useQueryClient();
  const update = useServerFn(updateImovel);
  return useMutation({
    mutationFn: (input: UpdateImovelInput) => update({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imovel-detalhe", id] });
      qc.invalidateQueries({ queryKey: ["imovel", id] });
      qc.invalidateQueries({ queryKey: ["property-sync", id] });
      qc.invalidateQueries({ queryKey: ["imoveis"] });
    },
  });
}
