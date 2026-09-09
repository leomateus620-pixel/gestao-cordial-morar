import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  emitRentalNfse,
  listRentalNfseEmissions,
  type NfseEmission,
} from "@/lib/nfse/nfse.functions";

export function useRentalNfse(contractId: string | null, enabled = true) {
  const qc = useQueryClient();
  const list = useServerFn(listRentalNfseEmissions);
  const emit = useServerFn(emitRentalNfse);

  const query = useQuery<NfseEmission[]>({
    queryKey: ["rental-nfse", contractId],
    enabled: Boolean(contractId) && enabled,
    queryFn: () => list({ data: { contractId: contractId as string } }),
  });

  const emitMutation = useMutation({
    mutationFn: (vars: { modoTeste: boolean; competencia?: string | null }) =>
      emit({
        data: {
          contractId: contractId as string,
          modoTeste: vars.modoTeste,
          competencia: vars.competencia ?? null,
        },
      }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["rental-nfse", contractId] });
      if (result.emission.status === "erro") toast.error(result.message);
      else toast.success(result.message);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível emitir a NFS-e.");
    },
  });

  return {
    emissions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    emit: emitMutation.mutateAsync,
    isEmitting: emitMutation.isPending,
  };
}
