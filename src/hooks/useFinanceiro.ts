import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createLancamento as createFn,
  deleteLancamento as deleteFn,
  listLancamentos,
  updateLancamento as updateFn,
  type LancamentoInput,
} from "@/lib/financeiro/financeiro.functions";
import type { Lancamento } from "@/lib/mock/data";
import { supabase } from "@/integrations/supabase/client";

const KEY = ["financeiro", "lancamentos"] as const;

export function useFinanceiro() {
  const qc = useQueryClient();
  const list = useServerFn(listLancamentos);
  const create = useServerFn(createFn);
  const update = useServerFn(updateFn);
  const remove = useServerFn(deleteFn);

  const query = useQuery<Lancamento[]>({
    queryKey: KEY,
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]);

  // Realtime: qualquer alteração na tabela (inclusive vinda do cron de sync
  // automático) invalida a query e atualiza dashboard/gráficos sozinho.
  useEffect(() => {
    const channel = supabase
      .channel("financeiro_lancamentos_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financeiro_lancamentos" },
        () => invalidate(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidate]);

  const createMutation = useMutation({
    mutationFn: (input: LancamentoInput) => create({ data: input }),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; input: LancamentoInput }) => update({ data: vars }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });

  return {
    lancamentos: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: invalidate,
    createLancamento: createMutation.mutateAsync,
    updateLancamento: updateMutation.mutateAsync,
    deleteLancamento: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
