import { useCallback } from "react";
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
    isError: query.isError,
    error: query.error,
    refetch: invalidate,
    createLancamento: createMutation.mutateAsync,
    updateLancamento: updateMutation.mutateAsync,
    deleteLancamento: deleteMutation.mutateAsync,
    isSaving:
      createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
