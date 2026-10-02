import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  emitRentalNfse,
  listRentalNfseEmissions,
  previewRentalNfse,
  reconcileRentalNfse,
  type NfseEmission,
  type NfsePreview,
} from "@/lib/nfse/nfse.functions";

const POLL_MS = 5_000;
const POLL_MAX_MS = 120_000;

export function useRentalNfse(contractId: string | null, enabled = true) {
  const qc = useQueryClient();
  const list = useServerFn(listRentalNfseEmissions);
  const emit = useServerFn(emitRentalNfse);
  const reconcile = useServerFn(reconcileRentalNfse);

  const query = useQuery<NfseEmission[]>({
    queryKey: ["rental-nfse", contractId],
    enabled: Boolean(contractId) && enabled,
    queryFn: () => list({ data: { contractId: contractId as string } }),
    refetchInterval: (q) => {
      const rows = q.state.data ?? [];
      const active = rows.some(
        (r) =>
          r.status === "processando" &&
          Date.now() - new Date(r.updatedAt ?? r.createdAt).getTime() < POLL_MAX_MS,
      );
      return active ? POLL_MS : false;
    },
  });

  const onDone = (result: { emission: NfseEmission | null; message: string }) => {
    void qc.invalidateQueries({ queryKey: ["rental-nfse", contractId] });
    void qc.invalidateQueries({ queryKey: ["rental-nfse-preview", contractId] });
    void qc.invalidateQueries({ queryKey: ["nfse-health"] });
    const s = result.emission?.status;
    if (s === "teste_ok" || s === "emitida") toast.success(result.message);
    else toast.error(result.message);
  };
  const onFail = (error: unknown) => {
    void qc.invalidateQueries({ queryKey: ["rental-nfse", contractId] });
    toast.error(error instanceof Error ? error.message : "Não foi possível emitir a NFS-e.");
  };

  const emitMutation = useMutation({
    mutationFn: (vars: { modoTeste: boolean; competencia: string; confirmarEmissaoReal?: boolean }) =>
      emit({ data: { contractId: contractId as string, ...vars } }),
    onSuccess: onDone,
    onError: onFail,
  });

  const reconcileMutation = useMutation({
    mutationFn: (emissionId: string) => reconcile({ data: { emissionId } }),
    onSuccess: onDone,
    onError: onFail,
  });

  return {
    emissions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    emit: emitMutation.mutateAsync,
    isEmitting: emitMutation.isPending,
    reconcile: reconcileMutation.mutate,
    reconcilingId: reconcileMutation.isPending ? reconcileMutation.variables : null,
  };
}

export function useRentalNfsePreview(contractId: string, competencia: string, enabled: boolean) {
  const preview = useServerFn(previewRentalNfse);
  return useQuery<NfsePreview>({
    queryKey: ["rental-nfse-preview", contractId, competencia],
    enabled,
    queryFn: () => preview({ data: { contractId, competencia } }),
    retry: false,
  });
}
