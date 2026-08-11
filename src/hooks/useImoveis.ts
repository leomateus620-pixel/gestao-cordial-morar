import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createImovel,
  getImovel,
  getImoveisFacets,
  listImoveis,
  type CreateImovelInput,
  type ListImoveisInput,
} from "@/lib/imoveis/imoveis.functions";
import type { Property } from "@/types/property";

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
