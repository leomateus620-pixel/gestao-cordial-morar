import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  FilePenLine,
  History,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Send,
  User,
  UserCheck,
  UserRoundCog,
  X,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AtendimentoActionsDialog,
  type AtendimentoActionKind,
  type AtendimentoActionPayload,
} from "@/components/atendimentos/AtendimentoActionsDialog";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import {
  addAttendanceNote,
  listAttendanceHistory,
  type AttendanceHistoryEvent,
} from "@/lib/attendances/attendances.functions";
import {
  ACTIVE_PIPELINE_STAGES,
  atendimentoDormitoriosLabel,
  atendimentoFinalidadeLabel,
  atendimentoImobiliariaLabel,
  atendimentoOrigemLabel,
  atendimentoPrioridadeLabel,
  atendimentoProximoPassoLabel,
  atendimentoStatusLabel,
  atendimentoTipoImovelLabel,
  pipelineStageLabel,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";
import {
  describeAttendanceHistoryEvent,
  formatAtendimentoBudget,
  formatCompactCurrency,
  formatDate,
  formatDateTime,
  formatExactDateTime,
  getPipelineContext,
  isAtendimentoOverdue,
  whatsappHref,
} from "@/services/atendimentos";
import { ATTENDANCES_QUERY_KEY, attendanceHistoryQueryKey } from "@/hooks/useAttendances";
import { cn } from "@/lib/utils";

type Props = {
  atendimento: Atendimento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageChange: (id: string, stage: PipelineStage) => Promise<void> | void;
  onAction: (payload: AtendimentoActionPayload, atendimento: Atendimento) => Promise<void> | void;
  onEdit: (atendimento: Atendimento) => void;
  onConvert: (id: string) => Promise<void> | void;
  onRegisterProposal: (atendimento: Atendimento) => Promise<void> | void;
  onCloseAttendance: (atendimento: Atendimento) => Promise<void> | void;
  onArchive: (atendimento: Atendimento) => Promise<void> | void;
  brokerOptions?: Array<{ id: string; nome: string }>;
  canAssignBroker?: boolean;
  canManageTerminalState?: boolean;
};

export function AtendimentoDetailDrawer({
  atendimento,
  open,
  onOpenChange,
  onStageChange,
  onAction,
  onEdit,
  onConvert,
  onRegisterProposal,
  onCloseAttendance,
  onArchive,
  brokerOptions = [],
  canAssignBroker = false,
  canManageTerminalState = false,
}: Props) {
  const [note, setNote] = useState("");
  const [activeKind, setActiveKind] = useState<AtendimentoActionKind | null>(null);
  const [confirmAction, setConfirmAction] = useState<"archive" | "close" | null>(null);
  const [stagePending, setStagePending] = useState(false);
  const qc = useQueryClient();

  const historyQuery = useQuery({
    queryKey: attendanceHistoryQueryKey(atendimento?.id),
    queryFn: () => listAttendanceHistory({ data: { attendanceId: atendimento!.id } }),
    enabled: Boolean(atendimento?.id && open),
    staleTime: 10_000,
  });

  const noteMutation = useMutation({
    mutationFn: (texto: string) =>
      addAttendanceNote({ data: { attendanceId: atendimento!.id, texto } }),
    onSuccess: () => {
      setNote("");
      toast.success("Nota adicionada ao histórico.");
      qc.invalidateQueries({ queryKey: attendanceHistoryQueryKey(atendimento?.id) });
      qc.invalidateQueries({ queryKey: ATTENDANCES_QUERY_KEY });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao registrar nota."),
  });

  useEffect(() => {
    if (!open) {
      setNote("");
      setActiveKind(null);
      setConfirmAction(null);
    }
  }, [open]);

  if (!atendimento) return null;
  const pipeline = getPipelineContext(atendimento);
  const overdue = isAtendimentoOverdue(atendimento);
  const whatsapp = whatsappHref(atendimento.telefone);
  const converted = atendimento.convertidoEmCliente || Boolean(atendimento.clienteConvertidoId);

  async function changeStage(stage: PipelineStage) {
    if (stage === atendimento!.pipelineStage || stagePending) return;
    setStagePending(true);
    try {
      await onStageChange(atendimento!.id, stage);
      toast.success(`Atendimento movido para ${pipelineStageLabel(stage)}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao mudar etapa.");
    } finally {
      setStagePending(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          closeLabel="Fechar"
          className="h-[100dvh] w-screen max-w-none overflow-hidden border-l border-stone-900/12 bg-[#f7f2ea] p-0 shadow-2xl data-[state=closed]:duration-200 data-[state=open]:duration-200 sm:w-[min(94vw,920px)] sm:max-w-[920px] [&>button]:hidden"
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="relative z-20 shrink-0 border-b border-stone-900/10 bg-[#fffdf9]/96 px-4 py-3 text-left backdrop-blur-xl sm:px-6 sm:py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-teal-800/70">
                      CRM · Atendimento
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                        pipelineStageUi[atendimento.pipelineStage].badge,
                      )}
                    >
                      {pipelineStageLabel(atendimento.pipelineStage)}
                    </span>
                  </div>
                  <SheetTitle className="mt-1 line-clamp-2 text-xl font-extrabold leading-6 tracking-[-0.02em] text-stone-950 sm:text-2xl sm:leading-7">
                    {atendimento.clienteNome}
                  </SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-stone-600">
                    <span>{atendimentoStatusLabel(atendimento.status)}</span>
                    <span>{atendimentoFinalidadeLabel(atendimento.finalidade)}</span>
                    <span>{atendimento.corretorNome ?? "Corretor a definir"}</span>
                    <span>Criado em {formatDate(atendimento.criadoEm)}</span>
                  </SheetDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(atendimento)}
                    className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-stone-900/12 bg-white px-3 text-xs font-bold text-stone-800 transition duration-200 hover:bg-stone-50 sm:inline-flex"
                  >
                    <Edit3 className="size-3.5" />
                    Editar atendimento
                  </button>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-xl border border-stone-900/10 bg-stone-100 text-stone-600 transition duration-200 hover:bg-stone-200 hover:text-stone-950"
                      aria-label="Fechar atendimento"
                    >
                      <X className="size-4" />
                    </button>
                  </SheetClose>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
              <div className="space-y-4">
                <StageProgress
                  atendimento={atendimento}
                  pending={stagePending}
                  onPick={(stage) => void changeStage(stage)}
                />

                <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <div className="space-y-4">
                    <SectionCard
                      eyebrow="Resumo comercial"
                      title="Próxima decisão"
                      icon={BriefcaseBusiness}
                    >
                      <div
                        className={cn(
                          "rounded-2xl border p-3",
                          overdue
                            ? "border-rose-700/20 bg-rose-50"
                            : "border-teal-800/12 bg-teal-950/[0.035]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p
                              className={cn(
                                "text-[9px] font-extrabold uppercase tracking-[0.12em]",
                                overdue ? "text-rose-700" : "text-teal-900/60",
                              )}
                            >
                              {overdue ? "Retorno atrasado" : "Próxima ação"}
                            </p>
                            <p className="mt-1 text-sm font-extrabold text-stone-900">
                              {atendimentoProximoPassoLabel(atendimento.proximoPasso)}
                            </p>
                          </div>
                          <p className="text-right text-xs font-bold text-stone-700">
                            {formatDateTime(atendimento.proximoRetorno)}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2">
                        <DataPoint label="Prioridade">
                          {atendimentoPrioridadeLabel(atendimento.prioridade)}
                        </DataPoint>
                        <DataPoint label="Origem">
                          {atendimentoOrigemLabel(atendimento.origem)}
                        </DataPoint>
                        <DataPoint label="Imobiliária">
                          {atendimentoImobiliariaLabel(atendimento.imobiliaria)}
                        </DataPoint>
                        <DataPoint label="Última transição">
                          {pipeline.transitionAt
                            ? formatDateTime(pipeline.transitionAt)
                            : "Ainda não registrada"}
                        </DataPoint>
                      </dl>
                      {pipeline.transitionActor ? (
                        <p className="mt-2 px-1 text-[10px] font-medium text-stone-500">
                          Movimento feito por {pipeline.transitionActor}
                          {pipeline.transitionSource
                            ? ` · origem ${sourceLabel(pipeline.transitionSource)}`
                            : ""}
                        </p>
                      ) : null}
                    </SectionCard>

                    <SectionCard eyebrow="Cliente" title="Contato" icon={User}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <ContactLine icon={Phone} label="Telefone">
                          {atendimento.telefone || "Não informado"}
                        </ContactLine>
                        <ContactLine icon={Mail} label="E-mail">
                          <span className="break-all">{atendimento.email ?? "Não informado"}</span>
                        </ContactLine>
                      </div>
                      {whatsapp ? (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Falar com ${atendimento.clienteNome} no WhatsApp`}
                          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_-14px_rgba(21,128,61,0.9)] transition duration-200 hover:bg-emerald-800 active:scale-[0.99]"
                        >
                          <MessageCircle className="size-4" />
                          Falar no WhatsApp
                          <ExternalLink className="size-3.5 opacity-70" />
                        </a>
                      ) : (
                        <p className="mt-3 rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-center text-xs font-semibold text-stone-500">
                          WhatsApp indisponível: telefone inválido.
                        </p>
                      )}
                      <p className="mt-2 text-[10px] text-stone-500">
                        Preferência: {contactPreferenceLabel(atendimento.contatoPreferencial)}
                      </p>
                    </SectionCard>

                    <SectionCard eyebrow="Demanda" title="Interesse comercial" icon={Building2}>
                      <dl className="grid grid-cols-2 gap-2">
                        <DataPoint label="Finalidade">
                          {atendimentoFinalidadeLabel(atendimento.finalidade)}
                        </DataPoint>
                        <DataPoint label="Tipo">
                          {atendimentoTipoImovelLabel(atendimento.tipoImovel)}
                        </DataPoint>
                        <DataPoint label="Dormitórios">
                          {atendimentoDormitoriosLabel(atendimento.dormitorios)}
                        </DataPoint>
                        <DataPoint label="Bairro / região">
                          {atendimento.bairroInteresse ?? "A definir"}
                        </DataPoint>
                        <DataPoint label="Orçamento" wide>
                          {formatAtendimentoBudget(atendimento)}
                        </DataPoint>
                      </dl>

                      <div className="mt-3 rounded-2xl border border-stone-900/10 bg-stone-50 p-3">
                        <p className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
                          <MapPin className="size-3.5" />
                          Imóvel vinculado
                        </p>
                        {atendimento.imovel ? (
                          <div className="mt-2">
                            <p className="text-sm font-extrabold leading-5 text-stone-900">
                              {atendimento.imovel.titulo}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-stone-600">
                              {[
                                atendimento.imovel.codigo
                                  ? `Cód. ${atendimento.imovel.codigo}`
                                  : null,
                                atendimento.imovel.tipo,
                                atendimento.imovel.valor !== undefined
                                  ? formatCompactCurrency(atendimento.imovel.valor)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {atendimento.imovel.endereco ? (
                              <p className="mt-1 text-[11px] leading-4.5 text-stone-600">
                                {[
                                  atendimento.imovel.endereco,
                                  atendimento.imovel.bairro,
                                  atendimento.imovel.cidade,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            ) : null}
                            <a
                              href={`/imoveis/${atendimento.imovel.id}`}
                              className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold text-teal-800 hover:text-teal-950"
                            >
                              Abrir imóvel <ExternalLink className="size-3" />
                            </a>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm font-bold text-stone-600">
                            Nenhum imóvel vinculado
                          </p>
                        )}
                      </div>

                      {atendimento.interesseDescricao ? (
                        <div className="mt-3">
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
                            Descrição do interesse
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stone-700">
                            {atendimento.interesseDescricao}
                          </p>
                        </div>
                      ) : null}
                      {atendimento.observacoes ? (
                        <div className="mt-3 border-t border-stone-900/8 pt-3">
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
                            Observações internas
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stone-700">
                            {atendimento.observacoes}
                          </p>
                        </div>
                      ) : null}
                    </SectionCard>
                  </div>

                  <div className="space-y-4 md:sticky md:top-0">
                    <SectionCard
                      eyebrow="Operação"
                      title="Ações do atendimento"
                      icon={MoreHorizontal}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <ActionButton icon={Edit3} onClick={() => onEdit(atendimento)}>
                          Editar atendimento
                        </ActionButton>
                        {canAssignBroker ? (
                          <ActionButton
                            icon={UserRoundCog}
                            onClick={() => setActiveKind("vincular-corretor")}
                          >
                            Atribuir corretor
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          icon={CalendarClock}
                          onClick={() => setActiveKind("criar-retorno")}
                        >
                          Agendar retorno
                        </ActionButton>
                        <ActionButton
                          icon={CalendarCheck2}
                          onClick={() => setActiveKind("criar-visita")}
                        >
                          Criar visita
                        </ActionButton>
                        <ActionButton
                          icon={FilePenLine}
                          onClick={() => void onRegisterProposal(atendimento)}
                        >
                          Registrar proposta
                        </ActionButton>
                        <ActionButton
                          icon={UserCheck}
                          disabled={converted}
                          onClick={() => void onConvert(atendimento.id)}
                        >
                          {converted ? "Cliente vinculado" : "Vincular a cliente"}
                        </ActionButton>
                      </div>
                      {canManageTerminalState ? (
                        <div className="mt-3 border-t border-stone-900/8 pt-3">
                          <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
                            Encerrar atendimento
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <SecondaryAction
                              icon={XCircle}
                              onClick={() => setActiveKind("motivo-perda")}
                            >
                              Perdido
                            </SecondaryAction>
                            <SecondaryAction
                              icon={Archive}
                              onClick={() => setConfirmAction("archive")}
                            >
                              Arquivar
                            </SecondaryAction>
                            <SecondaryAction
                              icon={CheckCircle2}
                              onClick={() => setConfirmAction("close")}
                            >
                              Fechar
                            </SecondaryAction>
                          </div>
                        </div>
                      ) : null}
                    </SectionCard>

                    <SectionCard eyebrow="Registro" title="Nova nota" icon={MessageSquare}>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        placeholder="Registre uma observação, follow-up ou contexto..."
                        className="min-h-24 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm leading-5 text-stone-900 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                      />
                      <button
                        type="button"
                        disabled={!note.trim() || noteMutation.isPending}
                        onClick={() => noteMutation.mutate(note.trim())}
                        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-3 text-xs font-extrabold text-white transition duration-200 hover:bg-teal-900 disabled:opacity-45"
                      >
                        <Send className="size-3.5" />
                        {noteMutation.isPending ? "Registrando..." : "Adicionar ao histórico"}
                      </button>
                    </SectionCard>

                    <section aria-labelledby="history-title">
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <div>
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-teal-800/60">
                            Auditoria
                          </p>
                          <h3
                            id="history-title"
                            className="mt-0.5 flex items-center gap-2 text-sm font-extrabold text-stone-900"
                          >
                            <History className="size-4" />
                            Histórico estruturado
                          </h3>
                        </div>
                        <span className="rounded-full border border-stone-900/10 bg-white px-2 py-1 text-[10px] font-extrabold text-stone-600">
                          {historyQuery.data?.length ?? 0}
                        </span>
                      </div>
                      <HistoryTimeline
                        events={historyQuery.data ?? []}
                        isLoading={historyQuery.isLoading}
                        isError={historyQuery.isError}
                      />
                    </section>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-stone-900/10 bg-[#fffdf9]/96 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden">
              <button
                type="button"
                onClick={() => onEdit(atendimento)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-extrabold text-white"
              >
                <Edit3 className="size-4" />
                Editar atendimento
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AtendimentoActionsDialog
        kind={activeKind}
        atendimento={atendimento}
        brokerOptions={brokerOptions}
        open={activeKind !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setActiveKind(null);
        }}
        onSubmit={(payload) => onAction(payload, atendimento)}
      />

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmAction(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl border border-stone-900/10 bg-[#fffdf9] shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-extrabold text-stone-950">
              {confirmAction === "close" ? "Fechar atendimento?" : "Arquivar atendimento?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-stone-600">
              {confirmAction === "close"
                ? "O atendimento será movido para Fechamento e marcado como fechado."
                : "O atendimento sairá do funil ativo e continuará disponível no histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-stone-900 text-white hover:bg-stone-800"
              onClick={() => {
                if (confirmAction === "close") {
                  void onCloseAttendance(atendimento);
                } else {
                  void onArchive(atendimento);
                }
                setConfirmAction(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StageProgress({
  atendimento,
  pending,
  onPick,
}: {
  atendimento: Atendimento;
  pending: boolean;
  onPick: (stage: PipelineStage) => void;
}) {
  const currentIndex = ACTIVE_PIPELINE_STAGES.indexOf(atendimento.pipelineStage);
  const activeStageRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeStageRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [atendimento.id, atendimento.pipelineStage]);

  return (
    <section className="rounded-[1.4rem] border border-stone-900/10 bg-[#fffdf9] p-3 shadow-[0_12px_30px_-28px_rgba(31,41,55,0.8)]">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-teal-800/60">
            Continuidade
          </p>
          <h2 className="mt-0.5 text-sm font-extrabold text-stone-900">Progresso do atendimento</h2>
        </div>
        <p className="text-right text-[10px] font-semibold text-stone-500">
          Use os botões ou o seletor do card
        </p>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {ACTIVE_PIPELINE_STAGES.map((stage, index) => {
          const active = stage === atendimento.pipelineStage;
          const completed = currentIndex >= 0 && index < currentIndex;
          const ui = pipelineStageUi[stage];
          return (
            <button
              key={stage}
              ref={active ? activeStageRef : undefined}
              type="button"
              disabled={pending}
              onClick={() => onPick(stage)}
              className={cn(
                "relative min-h-12 min-w-32 flex-1 rounded-xl border px-3 text-left transition duration-200 disabled:opacity-60",
                active
                  ? ui.badge
                  : completed
                    ? "border-emerald-700/18 bg-emerald-50/70 text-emerald-900"
                    : "border-stone-900/10 bg-stone-50 text-stone-600 hover:bg-white",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span className="block text-[8px] font-extrabold uppercase tracking-[0.12em] opacity-60">
                {completed ? "Concluída" : active ? "Atual" : `Etapa ${ui.order}`}
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-extrabold">
                {pipelineStageLabel(stage)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SectionCard({
  eyebrow,
  title,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.4rem] border border-stone-900/10 bg-[#fffdf9] p-4 shadow-[0_12px_30px_-28px_rgba(31,41,55,0.75)]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-xl bg-teal-900/8 text-teal-900">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-teal-800/60">
            {eyebrow}
          </p>
          <h3 className="mt-0.5 text-sm font-extrabold text-stone-900">{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function DataPoint({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-stone-900/8 bg-stone-50/75 px-3 py-2.5",
        wide && "col-span-2",
      )}
    >
      <dt className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-bold leading-4.5 text-stone-800">{children}</dd>
    </div>
  );
}

function ContactLine({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-900/8 bg-stone-50/75 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-bold leading-4.5 text-stone-800">{children}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  disabled,
  onClick,
  children,
}: {
  icon: typeof Edit3;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 items-center gap-2 rounded-xl border border-stone-900/10 bg-stone-50 px-3 text-left text-[11px] font-extrabold leading-4 text-stone-800 transition duration-200 hover:border-teal-800/20 hover:bg-teal-50 hover:text-teal-950 active:scale-[0.99] disabled:opacity-45"
    >
      <Icon className="size-4 shrink-0 text-teal-800" />
      {children}
    </button>
  );
}

function SecondaryAction({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Archive;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-10 flex-col items-center justify-center gap-1 rounded-xl border border-stone-900/10 bg-white px-2 py-2 text-[9px] font-bold text-stone-600 transition duration-200 hover:bg-stone-100 hover:text-stone-900"
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function HistoryTimeline({
  events,
  isLoading,
  isError,
}: {
  events: AttendanceHistoryEvent[];
  isLoading: boolean;
  isError: boolean;
}) {
  const items = useMemo(() => events, [events]);
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-stone-900/10 bg-white/70 p-6 text-center text-xs font-semibold text-stone-500">
        Carregando histórico...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-2xl border border-rose-700/16 bg-rose-50 p-6 text-center text-xs font-semibold text-rose-800">
        Não foi possível carregar o histórico.
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-400/40 bg-white/55 p-6 text-center text-xs font-semibold text-stone-500">
        Nenhum evento registrado ainda.
      </div>
    );
  }
  return (
    <ol className="relative space-y-2 border-l border-teal-800/18 pl-4">
      {items.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[19px] top-4 size-2.5 rounded-full bg-teal-800 ring-4 ring-[#f7f2ea]" />
          <article className="rounded-2xl border border-stone-900/10 bg-[#fffdf9] p-3 shadow-[0_10px_24px_-24px_rgba(31,41,55,0.85)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full border border-teal-800/15 bg-teal-800/8 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-teal-900">
                {eventTypeLabel(event.eventType)}
              </span>
              <time
                dateTime={event.createdAt}
                className="font-mono text-[9px] font-semibold text-stone-500"
              >
                {formatExactDateTime(event.createdAt)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-5 text-stone-800">
              {describeAttendanceHistoryEvent(event)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-medium text-stone-500">
              <span>
                {event.actorName ? `por ${event.actorName}` : "responsável não identificado"}
              </span>
              <span aria-hidden="true">·</span>
              <span>origem {sourceLabel(event.source)}</span>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    criacao: "Criação",
    stage_change: "Etapa",
    status_change: "Status",
    attendance_update: "Atualização",
    broker_change: "Corretor",
    client_link: "Cliente vinculado",
    property_link: "Imóvel",
    next_return: "Retorno",
    next_action: "Próxima ação",
    note: "Nota",
  };
  return map[type] ?? type.replaceAll("_", " ");
}

function sourceLabel(source: string) {
  if (source === "trigger") return "sistema";
  if (source === "manual") return "manual";
  if (source === "backfill") return "migração";
  return source;
}

function contactPreferenceLabel(value: Atendimento["contatoPreferencial"]) {
  if (value === "ligacao") return "Ligação";
  if (value === "email") return "E-mail";
  return "WhatsApp";
}
