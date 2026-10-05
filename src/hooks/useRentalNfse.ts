import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  emitRentalNfse,
  getNfseViewer,
  listRentalNfseEmissions,
  markRentalNfseNotIssued,
  retryNfsePdf,
  getNfsePdfUrl,
  previewRentalNfse,
  reconcileRentalNfse,
  type NfseBrand,
  type NfseEmission,
} from "@/lib/nfse/nfse.functions";
import type { FiscalReview } from "@/lib/nfse/fiscal-profile";
import { PROCESSANDO_STALE_MS } from "@/lib/nfse/emission-rules";

const PAGE_SIZE = 20;
export type RentalFiscalPreviewInput = {
  competencia: string;
  emissor?: NfseBrand;
  modoTeste: boolean;
  review?: FiscalReview;
};

export function useRentalNfse(contractId: string | null, enabled = true, modoTeste = false) {
  const [actionError, setActionError] = useState<string | null>(null);
  const qc = useQueryClient();
  const list = useServerFn(listRentalNfseEmissions);
  const emit = useServerFn(emitRentalNfse);
  const reconcile = useServerFn(reconcileRentalNfse);
  const mark = useServerFn(markRentalNfseNotIssued);
  const retryPdfFn = useServerFn(retryNfsePdf);
  const pdfUrlFn = useServerFn(getNfsePdfUrl);
  const viewerFn = useServerFn(getNfseViewer);
  const viewer = useQuery({
    queryKey: ["nfse-viewer"],
    enabled,
    queryFn: () => viewerFn(),
    staleTime: 300_000,
  });

  // Polling only refreshes presentation. Transmission and recovery belong to the server.
  const query = useInfiniteQuery({
    queryKey: ["rental-nfse", contractId, modoTeste],
    enabled: Boolean(contractId) && enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      list({
        data: { contractId: contractId as string, offset: pageParam, limit: PAGE_SIZE, modoTeste },
      }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    refetchOnMount: "always",
    refetchInterval: (q) => {
      const rows = q.state.data?.pages.flat() ?? [];
      return rows.some(
        (r) =>
          r.status === "processando" &&
          Date.now() - new Date(r.updatedAt ?? r.createdAt).getTime() < PROCESSANDO_STALE_MS,
      )
        ? 5_000
        : false;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["rental-nfse", contractId] });
    void qc.invalidateQueries({ queryKey: ["rental-nfse-preview", contractId] });
    void qc.invalidateQueries({ queryKey: ["nfse-health"] });
  };
  const onDone = (result: { emission: NfseEmission | null; message: string }) => {
    setActionError(null);
    refresh();
    const status = result.emission?.status;
    if (status === "teste_ok" || status === "emitida") toast.success(result.message);
    else if (status === "incerto" || status === "processando") toast.info(result.message);
    else toast.error(result.message);
  };
  const onFail = (error: unknown) => {
    refresh();
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível concluir a ação. Atualize o histórico e confira as pendências antes de tentar novamente.";
    setActionError(message);
    toast.error(message);
  };

  const emitMutation = useMutation({
    mutationFn: (
      vars: RentalFiscalPreviewInput & { previewToken: string; confirmarEmissaoReal?: boolean },
    ) => emit({ data: { contractId: contractId as string, ...vars } }),
    onSuccess: onDone,
    onError: onFail,
  });
  const reconcileMutation = useMutation({
    mutationFn: (vars: {
      emissionId: string;
      modo: "consulta" | "reenvio";
      confirmarReenvioReal?: boolean;
    }) => reconcile({ data: vars }),
    onSuccess: onDone,
    onError: onFail,
  });
  const markMutation = useMutation({
    mutationFn: (vars: { emissionId: string; reason: string }) =>
      mark({ data: { ...vars, conferidoNoPortal: true } }),
    onSuccess: (result) => {
      setActionError(null);
      refresh();
      toast.info(result.message);
    },
    onError: onFail,
  });

  const retryPdfMutation = useMutation({
    mutationFn: (emissionId: string) => retryPdfFn({ data: { emissionId } }),
    onSuccess: () => {
      setActionError(null);
      refresh();
      toast.success("PDF da nota guardado no aluguel.");
    },
    onError: onFail,
  });
  async function openPdf(emissionId: string) {
    const win = window.open("", "_blank");
    try {
      const { url } = await pdfUrlFn({ data: { emissionId } });
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      onFail(err as Error);
    }
  }

  return {
    openPdf,
    retryPdf: retryPdfMutation.mutateAsync,
    retryingPdfId: retryPdfMutation.isPending ? retryPdfMutation.variables : null,
    actionError,
    isAdmin: Boolean(viewer.data?.isAdmin),
    canEmit: Boolean(viewer.data?.canEmit),
    markNotIssued: markMutation.mutateAsync,
    isMarking: markMutation.isPending,
    emissions: query.data?.pages.flat() ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    emit: emitMutation.mutateAsync,
    isEmitting: emitMutation.isPending,
    reconcile: reconcileMutation.mutateAsync,
    reconcilingId: reconcileMutation.isPending ? reconcileMutation.variables.emissionId : null,
    reconcilingMode: reconcileMutation.isPending ? reconcileMutation.variables.modo : null,
  };
}

export function useRentalNfsePreview(
  contractId: string,
  input: RentalFiscalPreviewInput,
  enabled: boolean,
) {
  const preview = useServerFn(previewRentalNfse);
  return useQuery({
    queryKey: ["rental-nfse-preview", contractId, input],
    enabled,
    queryFn: () => preview({ data: { contractId, ...input } }),
    retry: false,
  });
}
