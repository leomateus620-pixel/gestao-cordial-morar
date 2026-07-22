import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  addSaleAttachment as addAttachmentFn,
  cancelSale as cancelFn,
  createSale as createFn,
  deleteSale as deleteFn,
  getSaleDocumentSignedUrl as signedUrlFn,
  getSalesKpis as kpisFn,
  listSales,
  removeSaleAttachment as removeAttachmentFn,
  setSalePaymentPaid as setPaidFn,
  updateSale as updateFn,
} from "@/lib/sales/sales.functions";
import type { SaleAttachment, SaleRecord, SaleRecordInput, SalesKpis } from "@/types/sale";

const SALES_KEY = ["sales"] as const;

export function useSales() {
  const queryClient = useQueryClient();
  const list = useServerFn(listSales);
  const kpis = useServerFn(kpisFn);
  const create = useServerFn(createFn);
  const update = useServerFn(updateFn);
  const cancel = useServerFn(cancelFn);
  const remove = useServerFn(deleteFn);
  const signUrl = useServerFn(signedUrlFn);
  const setPaid = useServerFn(setPaidFn);

  const salesQuery = useQuery<SaleRecord[]>({
    queryKey: [...SALES_KEY, "list"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const kpisQuery = useQuery<SalesKpis>({
    queryKey: [...SALES_KEY, "kpis"],
    queryFn: () => kpis(),
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SALES_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (input: SaleRecordInput) => create({ data: input }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; input: SaleRecordInput }) => update({ data: vars }),
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });

  const setPaidMutation = useMutation({
    mutationFn: (vars: { id: string; paid: boolean }) => setPaid({ data: vars }),
    onSuccess: invalidate,
  });

  const openContract = useCallback(
    async (path: string) => {
      const { url } = await signUrl({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [signUrl],
  );

  return {
    sales: salesQuery.data ?? [],
    kpis: kpisQuery.data,
    isLoading: salesQuery.isLoading,
    isError: salesQuery.isError,
    error: salesQuery.error,
    isKpisLoading: kpisQuery.isLoading,
    isKpisError: kpisQuery.isError,
    refetch: invalidate,
    createSale: createMutation.mutateAsync,
    updateSale: updateMutation.mutateAsync,
    cancelSale: cancelMutation.mutateAsync,
    deleteSale: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isCanceling: cancelMutation.isPending,
    setPaymentPaid: setPaidMutation.mutateAsync,
    isSettingPaid: setPaidMutation.isPending,
    openContract,
  };
}

/**
 * Upload contract to Supabase Storage under `{userId}/{tempOrSaleId}/{ts}-{name}`.
 * Returns the storage path to persist on the sale row.
 */
export async function uploadSaleDocument(file: File, folderId: string): Promise<string> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Sessão expirada. Faça login novamente.");
  const userId = userData.user.id;
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${userId}/${folderId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("sale-documents").upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeSaleDocument(path: string): Promise<void> {
  const { error } = await supabase.storage.from("sale-documents").remove([path]);
  if (error) throw new Error(error.message);
}
