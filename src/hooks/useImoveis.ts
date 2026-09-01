import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  archiveImovel,
  createImovel,
  deleteImovel,
  unarchiveImovel,
  getImovel,
  getImoveisFacets,
  getPropertyDetail,
  listImoveis,
  updateImovel,
  type ArchiveImovelResult,
  type CreateImovelInput,
  type DeleteImovelResult,
  type ListImoveisInput,
  type UpdateImovelInput,
} from "@/lib/imoveis/imoveis.functions";
import type { Property, PropertyDetail } from "@/types/property";

export function useDeleteImovel() {
  const qc = useQueryClient();
  const remove = useServerFn(deleteImovel);
  return useMutation<DeleteImovelResult, Error, string>({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: ["imoveis"] });
      qc.invalidateQueries({ queryKey: ["imoveis-facets"] });
      qc.invalidateQueries({ queryKey: ["imovel-detalhe", id] });
      qc.invalidateQueries({ queryKey: ["imovel", id] });
    },
  });
}


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

function useInvalidateImovel() {
  const qc = useQueryClient();
  return (id: string) => {
    qc.invalidateQueries({ queryKey: ["imoveis"] });
    qc.invalidateQueries({ queryKey: ["imoveis-facets"] });
    qc.invalidateQueries({ queryKey: ["imovel-detalhe", id] });
    qc.invalidateQueries({ queryKey: ["imovel", id] });
    qc.invalidateQueries({ queryKey: ["property-sync", id] });
  };
}

/** Arquiva o imóvel: sai dos sites, mas continua guardado no sistema. */
export function useArchiveImovel() {
  const invalidate = useInvalidateImovel();
  const archive = useServerFn(archiveImovel);
  return useMutation<ArchiveImovelResult, Error, string>({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: (_result, id) => invalidate(id),
  });
}

/** Reativa um imóvel arquivado (sem republicar automaticamente). */
export function useUnarchiveImovel() {
  const invalidate = useInvalidateImovel();
  const unarchive = useServerFn(unarchiveImovel);
  return useMutation<{ status: "active" }, Error, string>({
    mutationFn: (id: string) => unarchive({ data: { id } }),
    onSuccess: (_result, id) => invalidate(id),
  });
}
