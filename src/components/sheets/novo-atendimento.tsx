import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtendimentoFormModal } from "@/components/atendimentos/AtendimentoFormModal";
import { createAttendance } from "@/lib/attendances/attendances.functions";
import { ATTENDANCES_QUERY_KEY } from "@/hooks/useAttendances";
import type { AtendimentoCreateInput } from "@/types/atendimento";

/**
 * Compatibility wrapper for dashboard shortcuts.
 * Persiste o novo atendimento na nuvem (Supabase) via server function autenticada.
 */
export function NovoAtendimentoSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: AtendimentoCreateInput) => createAttendance({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ATTENDANCES_QUERY_KEY }),
  });

  async function handleSubmit(input: AtendimentoCreateInput) {
    try {
      await mutation.mutateAsync(input);
      toast.success(`Atendimento de ${input.clienteNome} salvo.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar atendimento.");
      throw err;
    }
  }

  return <AtendimentoFormModal open={open} onOpenChange={onOpenChange} onSubmit={handleSubmit} />;
}
