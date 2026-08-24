import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, LayoutGrid, List, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { AtendimentoCard } from "@/components/atendimentos/AtendimentoCard";
import { AtendimentoKanban } from "@/components/atendimentos/AtendimentoKanban";
import { AtendimentoDetailDrawer } from "@/components/atendimentos/AtendimentoDetailDrawer";
import { PipelineTrackSelector } from "@/components/atendimentos/PipelineTrackSelector";
import type { AtendimentoActionPayload } from "@/components/atendimentos/AtendimentoActionsDialog";
import { buildLocalIso } from "@/components/atendimentos/atendimento-action-utils";
import { AtendimentoFilters } from "@/components/atendimentos/AtendimentoFilters";
import { AtendimentoFormModal } from "@/components/atendimentos/AtendimentoFormModal";
import { AtendimentoSummaryCards } from "@/components/atendimentos/AtendimentoSummaryCards";
import { AtendimentoHandoffDialog } from "@/components/atendimentos/AtendimentoHandoffDialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  defaultAtendimentoFilters,
  attendanceHistoryQueryKey,
  useAttendances,
  type AtendimentoFilters as AtendimentoFiltersState,
  type AtendimentoPeriodFilter,
} from "@/hooks/useAttendances";
import { AGENDA_QUERY_KEY } from "@/hooks/useAgenda";
import { upsertAgendaEvent } from "@/lib/agenda/agenda.functions";
import { buildNextStepAgendaEvent } from "@/lib/atendimentos/next-step-event";

import { sendFirstAttendanceEmail } from "@/lib/attendances/email.functions";
import { addAttendanceNote, getAttendanceById } from "@/lib/attendances/attendances.functions";
import { useSession } from "@/lib/auth-mock";
import {
  canDeleteAttendance,
  canManageAttendanceAssignments,
  canSelfAssignAttendance,
  canManageAttendanceTerminalState,
  canSeeAttendanceHandoffMessage,
  canSeeFinancialInsights,
} from "@/lib/access-control";
import {
  parseTrackParam,
  finalidadeToTrack,
  trackToFinalidade,
  trackLabel,
  type CommercialTrack,
} from "@/lib/atendimentos/track";
import { cn } from "@/lib/utils";
import type {
  Atendimento,
  AtendimentoCreateInput,
  AtendimentoStatus,
  PipelineStage,
} from "@/types/atendimento";
import { ACTIVE_PIPELINE_STAGES, atendimentoStatusOptions } from "@/types/atendimento";
import type { AgendaEventInput } from "@/types/agenda";

export const Route = createFileRoute("/_app/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos — Gestão Cordial" }] }),
  validateSearch: (
    search: {
      id?: unknown;
      clienteId?: unknown;
      track?: unknown;
      corretorId?: unknown;
      periodo?: unknown;
      imobiliaria?: unknown;
      status?: unknown;
    } & SearchSchemaInput,
  ) => ({
    id: typeof search.id === "string" ? search.id : undefined,
    clienteId: typeof search.clienteId === "string" ? search.clienteId : undefined,
    track: parseTrackParam(search.track),
    corretorId: parseBrokerId(search.corretorId),
    periodo: parseOperationalPeriod(search.periodo),
    imobiliaria: parseAgency(search.imobiliaria),
    status: parseAttendanceStatus(search.status),
  }),
  component: Page,
});

function Page() {
  const session = useSession();
  const canViewFinancialInsights = canSeeFinancialInsights(session);
  const canAssignBroker =
    canManageAttendanceAssignments(session) || canSelfAssignAttendance(session);
  const canManageTerminalState = canManageAttendanceTerminalState(session);
  const {
    id: highlightId,
    clienteId: clienteIdFilter,
    track,
    corretorId,
    periodo,
    imobiliaria,
    status,
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setTrack = (nextTrack: CommercialTrack) => {
    if (nextTrack === track) return;
    navigate({
      to: ".",
      search: {
        track: nextTrack,
        id: highlightId,
        clienteId: clienteIdFilter,
        corretorId,
        periodo,
        imobiliaria,
        status,
      },
    });
    setSelectedStage("primeiro_contato");
  };
  const [open, setOpen] = useState(false);
  const [handoffAtendimento, setHandoffAtendimento] = useState<Atendimento | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AtendimentoFiltersState>(() => ({
    ...defaultAtendimentoFilters,
    corretor: corretorId ?? "todos",
    periodo: periodo ?? "todos",
    status: status ?? "todos",
  }));
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [selectedStage, setSelectedStage] = useState<PipelineStage>("primeiro_contato");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  /** Atendimento carregado sob demanda quando o link aponta para fora da lista. */
  const [deepLinkAtendimento, setDeepLinkAtendimento] = useState<Atendimento | null>(null);
  const unavailableDeepLink = useRef<string | null>(null);
  const qc = useQueryClient();
  const {
    atendimentos,
    filteredAtendimentos: baseFilteredAtendimentos,
    trackCounts,
    brokers,
    stats,
    isLoading,
    isReady,
    isError,
    error,
    refetch,
    addAtendimento,
    convertAtendimento,
    updateAtendimento,
    removeAtendimento,

    transitionStage,
  } = useAttendances(query, filters, track, { agency: imobiliaria });

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      corretor: corretorId ?? "todos",
      periodo: periodo ?? "todos",
      status: status ?? "todos",
    }));
  }, [corretorId, periodo, status]);
  const filteredAtendimentos = useMemo(() => {
    if (!clienteIdFilter) return baseFilteredAtendimentos;
    return baseFilteredAtendimentos.filter(
      (a) => a.clienteId === clienteIdFilter || a.clienteConvertidoId === clienteIdFilter,
    );
  }, [baseFilteredAtendimentos, clienteIdFilter]);
  const detailAtendimento = useMemo(
    () =>
      atendimentos.find((a) => a.id === detailId) ??
      (deepLinkAtendimento?.id === detailId ? deepLinkAtendimento : null),
    [atendimentos, deepLinkAtendimento, detailId],
  );
  const editAtendimento = useMemo(
    () =>
      atendimentos.find((atendimento) => atendimento.id === editId) ??
      (deepLinkAtendimento?.id === editId ? deepLinkAtendimento : null),
    [atendimentos, deepLinkAtendimento, editId],
  );

  useEffect(() => {
    if (!highlightId || isError) return;
    const target =
      atendimentos.find((item) => item.id === highlightId) ??
      (deepLinkAtendimento?.id === highlightId ? deepLinkAtendimento : null);
    if (!target) {
      // Nunca concluir "não encontrado" antes de uma carga concluída com sucesso:
      // a lista só começa a carregar depois que a sessão é reconhecida.
      if (isLoading || !isReady) return;
      // Rede de segurança: o atendimento pode estar fora do recorte carregado
      // (filtro de imobiliária, cache antigo). Buscar o registro na nuvem.
      if (unavailableDeepLink.current === highlightId) return;
      unavailableDeepLink.current = highlightId;
      void (async () => {
        try {
          const result = await getAttendanceById({ data: { id: highlightId } });
          if (result.status === "ok") {
            setDeepLinkAtendimento(result.atendimento);
            return;
          }
          if (result.status === "forbidden") {
            toast.error("Você não tem permissão para abrir este atendimento.");
            return;
          }
          toast.error("Atendimento não encontrado. Ele pode ter sido excluído.");
        } catch {
          toast.error("Não foi possível abrir o atendimento agora. Tente novamente.");
        }
      })();
      return;
    }
    unavailableDeepLink.current = null;
    const targetTrack = finalidadeToTrack(target.finalidade);
    if (targetTrack !== "ambos" && targetTrack !== track) {
      navigate({
        to: ".",
        search: {
          track: targetTrack,
          id: highlightId,
          clienteId: clienteIdFilter,
          corretorId,
          periodo,
          imobiliaria,
          status,
        },
        replace: true,
      });
    }
    setSelectedStage(target.pipelineStage);
    setDetailId(target.id);
  }, [
    atendimentos,
    clienteIdFilter,
    corretorId,
    deepLinkAtendimento,
    highlightId,
    imobiliaria,
    isError,
    isLoading,
    isReady,
    navigate,
    periodo,
    status,
    track,
  ]);

  // First-open timing is closed only by the attendance detail drawer via the
  // backend RPC `mark_attendance_first_opened`, never from list rendering.

  const createVisitMutation = useMutation({
    mutationFn: (input: AgendaEventInput) => upsertAgendaEvent({ data: { input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENDA_QUERY_KEY }),
  });

  useEffect(() => {
    if (isError && error) toast.error(error.message ?? "Erro ao carregar atendimentos.");
  }, [isError, error]);

  async function createAtendimento(input: AtendimentoCreateInput) {
    try {
      const created = await addAtendimento(input);
      setOpen(false);
      if (canSeeAttendanceHandoffMessage(session)) setHandoffAtendimento(created);
      // "Próximo passo" com data vira automaticamente um evento na Agenda
      // (que já sincroniza com o Google Agenda do responsável).
      void (async () => {
        try {
          const event = buildNextStepAgendaEvent(created, {
            id: session?.id,
            nome: session?.nome,
          });
          if (!event) return;
          await createVisitMutation.mutateAsync(event);
          toast.success("Próximo passo agendado na Agenda.");
        } catch {
          toast.error("Atendimento salvo, mas não foi possível criar o evento na Agenda.");
        }
      })();

      // Dispara e-mail automático (server-side). Não bloqueia o cadastro.
      void (async () => {
        try {
          const res = await sendFirstAttendanceEmail({ data: { attendanceId: created.id } });
          if (res.status === "sent") {
            toast.success(`Atendimento de ${input.clienteNome} salvo e e-mail enviado ao cliente.`);
          } else if (res.status === "skipped" && res.reason === "no_email") {
            toast.success(
              `Atendimento de ${input.clienteNome} salvo. E-mail automático não enviado (cliente sem e-mail).`,
            );
          } else if (res.status === "skipped" && res.reason === "invalid_email") {
            toast.success(
              `Atendimento de ${input.clienteNome} salvo. E-mail automático não enviado (endereço inválido).`,
            );
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar atendimento.";
      toast.error(message);
      throw err;
    }
  }

  async function handleConvert(id: string) {
    try {
      await convertAtendimento(id);
      toast.success("Cadastro criado em Clientes.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível converter.");
    }
  }

  async function handleAction(payload: AtendimentoActionPayload, atendimento: Atendimento) {
    try {
      if (payload.kind === "vincular-corretor") {
        await updateAtendimento({
          id: atendimento.id,
          patch: { corretorId: payload.corretorId, corretorNome: payload.corretorNome },
        });
        toast.success(`Corretor vinculado: ${payload.corretorNome}.`);
        return;
      }
      if (payload.kind === "criar-visita") {
        const startIso = buildLocalIso(payload.data, payload.hora);
        if (!startIso) throw new Error("Data/horário inválidos.");
        const startDate = new Date(startIso);
        const endIso = new Date(startDate.getTime() + payload.duracaoMin * 60_000).toISOString();
        const input: AgendaEventInput = {
          titulo: `Visita — ${atendimento.clienteNome}`,
          descricao: payload.observacoes || undefined,
          tipo: "visita",
          status: "agendado",
          prioridade: atendimento.prioridade === "urgente" ? "urgente" : "media",
          inicio: startIso,
          fim: endIso,
          duracaoMin: payload.duracaoMin,
          diaInteiro: false,
          repeticao: "nao",
          imobiliaria: atendimento.imobiliaria,
          clienteId: atendimento.clienteConvertidoId ?? atendimento.clienteId,
          clienteNome: atendimento.clienteNome,
          atendimentoId: atendimento.id,
          imovelId: atendimento.imovelId,
          imovelDescricao: atendimento.imovelDescricao,
          local: payload.local || undefined,
          responsavelPrincipalId: atendimento.corretorId,
          responsavelPrincipalNome: atendimento.corretorNome,
          participantes: [],
          convidados: [],
          lembretes: [],
          checklist: [],
          observacoes: payload.observacoes || undefined,
          googleCalendarSyncStatus: "nao_sincronizado",
        };
        await createVisitMutation.mutateAsync(input);
        await updateAtendimento({
          id: atendimento.id,
          patch: {
            status: "visita_agendada",
            pipelineStage: "visita",
            proximoRetorno: startIso,
            proximoPasso: "agendar_visita",
          },
        });
        toast.success("Visita criada na agenda.");
        return;
      }
      if (payload.kind === "criar-retorno") {
        const iso = buildLocalIso(payload.data, payload.hora || "09:00");
        if (!iso) throw new Error("Data inválida.");
        await updateAtendimento({
          id: atendimento.id,
          patch: {
            proximoRetorno: iso,
            proximoPasso: payload.proximoPasso,
            status: "aguardando_retorno",
          },
        });
        toast.success("Tarefa de retorno agendada.");
        return;
      }
      if (payload.kind === "registrar-historico") {
        await addAttendanceNote({
          data: {
            attendanceId: atendimento.id,
            texto: payload.texto,
          },
        });
        qc.invalidateQueries({ queryKey: attendanceHistoryQueryKey(atendimento.id) });
        toast.success("Histórico registrado.");
        return;
      }
      if (payload.kind === "motivo-perda") {
        await updateAtendimento({
          id: atendimento.id,
          patch: {
            status: "perdido",
            pipelineStage: "perdido",
            motivoPerda: payload.motivoPerda,
          },
        });
        toast.success("Atendimento marcado como perdido.");
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar ação.");
      throw err;
    }
  }

  async function handleStageChange(id: string, stage: PipelineStage) {
    const atendimento = atendimentos.find((item) => item.id === id);
    if (!atendimento) throw new Error("Atendimento não encontrado.");
    if (stage === "em_espera") {
      await updateAtendimento({
        id,
        patch: { pipelineStage: "em_espera", status: "aguardando_retorno" },
      });
      toast.success("Atendimento movido para a fila de espera.");
      return;
    }
    const reopening =
      atendimento.pipelineStage === "perdido" ||
      atendimento.pipelineStage === "em_espera" ||
      atendimento.pipelineStage === "arquivado" ||
      atendimento.status === "perdido" ||
      atendimento.status === "arquivado";
    if (reopening) {
      await updateAtendimento({
        id,
        patch: {
          pipelineStage: stage,
          status: "em_atendimento",
          motivoPerda: null,
        },
      });
      return;
    }
    await transitionStage(id, stage);
  }

  async function saveEditedAtendimento(input: AtendimentoCreateInput) {
    if (!editId) return;
    try {
      await updateAtendimento({ id: editId, patch: input });
      setEditId(null);
      toast.success("Atendimento atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar atendimento.");
      throw error;
    }
  }

  async function deleteEditedAtendimento() {
    if (!editId) return;
    try {
      await removeAtendimento(editId);
      setEditId(null);
      setDetailId(null);
      toast.success("Atendimento excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir atendimento.");
      throw error;
    }
  }


  async function registerProposal(atendimento: Atendimento) {
    try {
      await updateAtendimento({
        id: atendimento.id,
        patch: {
          pipelineStage: "proposta",
          status: "proposta_enviada",
          proximoPasso: "aguardar_cliente",
        },
      });
      toast.success("Proposta registrada no atendimento.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao registrar proposta.");
    }
  }

  async function closeAtendimento(atendimento: Atendimento) {
    try {
      await updateAtendimento({
        id: atendimento.id,
        patch: {
          pipelineStage: "fechamento",
          status: "fechado",
        },
      });
      toast.success("Atendimento fechado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao fechar atendimento.");
    }
  }

  const hasAtendimentos = atendimentos.length > 0;
  const activeFilteredCount = filteredAtendimentos.filter((atendimento) =>
    ACTIVE_PIPELINE_STAGES.includes(atendimento.pipelineStage),
  ).length;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#174d61_0%,#1e647d_48%,#28333b_100%)] p-5 text-white shadow-[0_24px_60px_-24px_rgba(23,27,33,0.55)] sm:p-6">
        <span className="absolute -right-10 -top-16 size-44 rounded-full bg-cyan-200/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-200/13 ring-1 ring-white/10">
              <Inbox className="size-6 text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-300">
                Central de entrada comercial
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
                Atendimentos
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/64">
                Do primeiro contato ao encaminhamento, com dados prontos para revelar o nicho real
                da imobiliária.
              </p>
              <p className="mt-2 hidden items-center gap-1.5 text-[10px] font-semibold text-white/55 md:flex">
                <Workflow className="size-3 text-orange-300" />
                Pré-atendimento · Corretor · Conversão
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-orange-400 px-4 py-3 text-sm font-semibold text-stone-900 shadow-[0_10px_30px_-12px_rgba(251,146,60,0.65)] ring-1 ring-orange-300/40 transition hover:bg-orange-300 hover:shadow-[0_18px_40px_-12px_rgba(251,146,60,0.7)] active:scale-[0.98] sm:w-auto"
          >
            <Plus className="size-4 transition-transform group-hover:rotate-90" />
            Novo atendimento
          </button>
        </div>
      </section>

      <PipelineTrackSelector value={track} onChange={setTrack} counts={trackCounts} />

      <AtendimentoFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        brokerOptions={brokers}
      />

      <AtendimentoSummaryCards
        stats={stats}
        selectedStage={selectedStage}
        onStageChange={(stage) => {
          setSelectedStage(stage);
          setView("kanban");
        }}
        canViewFinancialInsights={canViewFinancialInsights}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">CRM comercial</h2>
            <p className="text-[11px] text-foreground/50">
              {activeFilteredCount} ativo{activeFilteredCount === 1 ? "" : "s"}
              {filteredAtendimentos.length !== activeFilteredCount
                ? ` · ${filteredAtendimentos.length} no recorte atual`
                : " no recorte atual"}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/55 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition",
                view === "kanban"
                  ? "bg-teal-700 text-white shadow"
                  : "text-teal-800 hover:bg-teal-700/8",
              )}
            >
              <LayoutGrid className="size-3" /> Funil
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition",
                view === "list"
                  ? "bg-teal-700 text-white shadow"
                  : "text-teal-800 hover:bg-teal-700/8",
              )}
            >
              <List className="size-3" /> Lista
            </button>
          </div>
        </div>

        {isLoading ? (
          <EmptyState
            title="Carregando atendimentos..."
            description="Buscando registros na nuvem."
            icon={<Inbox className="size-5" />}
          />
        ) : isError ? (
          <EmptyState
            title="Não foi possível carregar os atendimentos."
            description={error?.message ?? "Verifique sua conexão e tente novamente."}
            icon={<Inbox className="size-5" />}
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white"
              >
                Tentar novamente
              </button>
            }
          />
        ) : filteredAtendimentos.length > 0 ? (
          view === "kanban" ? (
            <AtendimentoKanban
              atendimentos={filteredAtendimentos}
              selectedStage={selectedStage}
              onSelectedStageChange={setSelectedStage}
              highlightId={highlightId}
              onOpenDetail={(a) => setDetailId(a.id)}
              onStageChange={handleStageChange}
              onAction={handleAction}
              brokerOptions={brokers}
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredAtendimentos.map((atendimento) => (
                <div
                  key={atendimento.id}
                  className={
                    highlightId === atendimento.id
                      ? "rounded-3xl ring-2 ring-orange-400 ring-offset-2 ring-offset-background transition"
                      : undefined
                  }
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button,select,textarea,input,a")) return;
                    setDetailId(atendimento.id);
                  }}
                >
                  <AtendimentoCard
                    atendimento={atendimento}
                    onOpen={(item) => setDetailId(item.id)}
                    onStageChange={handleStageChange}
                    onAction={handleAction}
                    brokerOptions={brokers}
                  />
                </div>
              ))}
            </div>
          )
        ) : hasAtendimentos ? (
          <EmptyState
            title="Nenhum atendimento encontrado com os filtros atuais."
            description="Ajuste a busca ou os filtros para ver outros registros."
            icon={<Inbox className="size-5" />}
          />
        ) : (
          <EmptyState
            title="Nenhum atendimento cadastrado ainda."
            description="Clique em Novo atendimento para registrar o primeiro contato comercial."
            icon={<Inbox className="size-5" />}
            action={
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800 active:scale-[0.98]"
              >
                <Plus className="size-3.5" />
                Novo atendimento
              </button>
            }
          />
        )}
      </section>

      <AtendimentoDetailDrawer
        atendimento={detailAtendimento}
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null);
            if (highlightId) {
              navigate({
                to: ".",
                search: {
                  track,
                  clienteId: clienteIdFilter,
                  corretorId,
                  periodo,
                  imobiliaria,
                  status,
                },
                replace: true,
              });
            }
          }
        }}
        onStageChange={handleStageChange}
        onAction={handleAction}
        onEdit={(atendimento) => {
          setDetailId(null);
          setEditId(atendimento.id);
        }}
        onConvert={handleConvert}
        onRegisterProposal={registerProposal}
        onCloseAttendance={closeAtendimento}
        brokerOptions={brokers}
        canAssignBroker={canAssignBroker}
        canManageTerminalState={canManageTerminalState}
      />

      {open && (
        <AtendimentoFormModal
          open={open}
          onOpenChange={setOpen}
          onSubmit={createAtendimento}
          brokerOptions={brokers}
          presetTrack={track}
        />
      )}
      <AtendimentoHandoffDialog
        atendimento={handoffAtendimento}
        autorNome={session?.nome}
        onClose={() => setHandoffAtendimento(null)}
      />
      {editId && editAtendimento ? (
        <AtendimentoFormModal
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditId(null);
          }}
          onSubmit={saveEditedAtendimento}
          initialValue={editAtendimento}
          brokerOptions={brokers}
          canDelete={canDeleteAttendance(session, editAtendimento)}
          onDelete={deleteEditedAtendimento}
        />

      ) : null}
    </div>
  );
}

const BROKER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationalPeriods = new Set<AtendimentoPeriodFilter>([
  "mes",
  "ultimos_30",
  "trimestre",
  "ano",
]);
const attendanceStatuses = new Set<AtendimentoStatus>(
  atendimentoStatusOptions.map((option) => option.value),
);

function parseBrokerId(value: unknown) {
  return typeof value === "string" && BROKER_ID_PATTERN.test(value) ? value : undefined;
}

function parseOperationalPeriod(value: unknown): AtendimentoPeriodFilter | undefined {
  return typeof value === "string" && operationalPeriods.has(value as AtendimentoPeriodFilter)
    ? (value as AtendimentoPeriodFilter)
    : undefined;
}

function parseAgency(value: unknown): "todas" | "cordial" | "morar" | undefined {
  return value === "todas" || value === "cordial" || value === "morar" ? value : undefined;
}

function parseAttendanceStatus(value: unknown): AtendimentoStatus | undefined {
  return typeof value === "string" && attendanceStatuses.has(value as AtendimentoStatus)
    ? (value as AtendimentoStatus)
    : undefined;
}
