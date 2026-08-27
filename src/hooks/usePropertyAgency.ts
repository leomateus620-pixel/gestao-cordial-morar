import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  finalizePropertyAgency,
  getLinkedAgenciamento,
  type FinalizePropertyAgencyInput,
} from "@/lib/agenciamentos/property-link.functions";
import type { Agenciamento } from "@/types/agenciamento";

/** Agenciamento vinculado a um imóvel do catálogo (Etapa 7 / ficha do imóvel). */
export function useLinkedAgenciamento(propertyId: string | null | undefined) {
  const get = useServerFn(getLinkedAgenciamento);
  return useQuery<Agenciamento | null>({
    queryKey: ["agenciamento-vinculado", propertyId],
    queryFn: () => get({ data: { propertyId: propertyId as string } }),
    enabled: !!propertyId,
    staleTime: 30_000,
  });
}

export function useFinalizePropertyAgency() {
  const qc = useQueryClient();
  const finalize = useServerFn(finalizePropertyAgency);
  return useMutation({
    mutationFn: (input: FinalizePropertyAgencyInput) => finalize({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenciamentos"] });
      qc.invalidateQueries({ queryKey: ["agenciamento-bonuses"] });
      qc.invalidateQueries({ queryKey: ["agenciamento-vinculado"] });
    },
  });
}
