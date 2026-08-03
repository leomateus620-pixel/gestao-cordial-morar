import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtendimentoFormModal } from "@/components/atendimentos/AtendimentoFormModal";
import { AtendimentoHandoffDialog } from "@/components/atendimentos/AtendimentoHandoffDialog";
import { canSeeAttendanceHandoffMessage } from "@/lib/access-control";
import { createAttendance } from "@/lib/attendances/attendances.functions";
import { sendBrokerAssignmentEmail, sendFirstAttendanceEmail } from "@/lib/attendances/email.functions";
import { upsertAgendaEvent } from "@/lib/agenda/agenda.functions";
import { buildNextStepAgendaEvent } from "@/lib/atendimentos/next-step-event";
import { AGENDA_QUERY_KEY } from "@/hooks/useAgenda";
import { useSession } from "@/lib/auth-mock";
import { ATTENDANCES_QUERY_KEY } from "@/hooks/useAttendances";
import type { Atendimento, AtendimentoCreateInput } from "@/types/atendimento";


/**
 * Compatibility wrapper for dashboard shortcuts.
 * Persiste o novo atendimento na nuvem (Supabase) via server function autenticada
 * e dispara o e-mail automático de agradecimento.
 */
export function NovoAtendimentoSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const session = useSession();
  const [handoffAtendimento, setHandoffAtendimento] = useState<Atendimento | null>(null);
  const mutation = useMutation({
    mutationFn: (input: AtendimentoCreateInput) => createAttendance({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ATTENDANCES_QUERY_KEY }),
  });

  async function handleSubmit(input: AtendimentoCreateInput) {
    try {
      const created = await mutation.mutateAsync(input);
      if (canSeeAttendanceHandoffMessage(session)) setHandoffAtendimento(created);
      // "Próximo passo" com data cria o evento correspondente na Agenda.
      void (async () => {
        try {
          const event = buildNextStepAgendaEvent(created, {
            id: session?.id,
            nome: session?.nome,
          });
          if (!event) return;
          await upsertAgendaEvent({ data: { input: event } });
          await qc.invalidateQueries({ queryKey: AGENDA_QUERY_KEY });
          toast.success("Próximo passo agendado na Agenda.");
        } catch {
          toast.error("Atendimento salvo, mas não foi possível criar o evento na Agenda.");
        }
      })();
      void (async () => {

        try {
          const res = await sendFirstAttendanceEmail({ data: { attendanceId: created.id } });
          if (res.status === "sent") {
            toast.success(`Atendimento de ${input.clienteNome} salvo e e-mail enviado ao cliente.`);
          } else if (res.status === "skipped" && res.reason === "no_email") {
            toast.success(`Atendimento de ${input.clienteNome} salvo. E-mail automático não enviado (cliente sem e-mail).`);
          } else if (res.status === "skipped" && res.reason === "invalid_email") {
            toast.success(`Atendimento de ${input.clienteNome} salvo. E-mail automático não enviado (endereço inválido).`);
          } else if (res.status === "failed") {
            toast.success(`Atendimento de ${input.clienteNome} salvo.`);
            toast.error("Não foi possível enviar o e-mail automático agora.");
          } else {
            toast.success(`Atendimento de ${input.clienteNome} salvo.`);
          }
        } catch {
          toast.success(`Atendimento de ${input.clienteNome} salvo.`);
          toast.error("Não foi possível enviar o e-mail automático agora.");
        }
      })();

      if (input.corretorId && input.corretorId !== "a_definir") {
        void (async () => {
          try {
            await sendBrokerAssignmentEmail({
              data: { attendanceId: created.id, corretorId: input.corretorId as string },
            });
          } catch {
            /* silencioso — a notificação in-app já foi disparada pelo trigger */
          }
        })();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar atendimento.");
      throw err;
    }
  }

  return (
    <>
      <AtendimentoFormModal open={open} onOpenChange={onOpenChange} onSubmit={handleSubmit} />
      <AtendimentoHandoffDialog
        atendimento={handoffAtendimento}
        autorNome={session?.nome}
        onClose={() => setHandoffAtendimento(null)}
      />
    </>
  );
}
