import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { AtendimentoCard } from "@/components/atendimentos/AtendimentoCard";
import {
  buildLocalIso,
  type AtendimentoActionPayload,
} from "@/components/atendimentos/AtendimentoActionsDialog";
import { AtendimentoFilters } from "@/components/atendimentos/AtendimentoFilters";
import { AtendimentoFormModal } from "@/components/atendimentos/AtendimentoFormModal";
import { AtendimentoSummaryCards } from "@/components/atendimentos/AtendimentoSummaryCards";
import { EmptyState } from "@/components/shared/empty-state";
import {
  defaultAtendimentoFilters,
  useAttendances,
  type AtendimentoFilters as AtendimentoFiltersState,
} from "@/hooks/useAttendances";
import { AGENDA_QUERY_KEY } from "@/hooks/useAgenda";
import { upsertAgendaEvent } from "@/lib/agenda/agenda.functions";
import { sendFirstAttendanceEmail } from "@/lib/attendances/email.functions";
import { markAttendanceOpened } from "@/lib/attendances/attendances.functions";
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";
import type {
  Atendimento,
  AtendimentoCreateInput,
  AtendimentoStatus,
} from "@/types/atendimento";
import type { AgendaEventInput } from "@/types/agenda";

export const Route = createFileRoute("/_app/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos — Gestão Cordial" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: Page,
});

function Page() {
  const session = useSession();
  const canViewFinancialInsights = canSeeFinancialInsights(session);
  const { id: highlightId } = Route.useSearch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AtendimentoFiltersState>(defaultAtendimentoFilters);
  const {
    atendimentos,
    filteredAtendimentos,
    stats,
    isLoading,
    isError,
    error,
    addAtendimento,
    convertAtendimento,
    updateAtendimento,
  } = useAttendances(query, filters);

  useEffect(() => {
    if (!highlightId || isLoading) return;
    const el = document.getElementById(`atendimento-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, isLoading, filteredAtendimentos.length]);

  const openedMarkedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading || !session?.user?.id) return;
    const uid = session.user.id;
    for (const a of atendimentos) {
      if (
        a.corretorId === uid &&
        !a.openedAt &&
        !openedMarkedRef.current.has(a.id)
      ) {
        openedMarkedRef.current.add(a.id);
        markAttendanceOpened({ data: { id: a.id } })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["attendances"] });
          })
          .catch(() => {
            openedMarkedRef.current.delete(a.id);
          });
      }
    }
  }, [atendimentos, isLoading, session?.user?.id]);


  const qc = useQueryClient();
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
      // Dispara e-mail automático (server-side). Não bloqueia o cadastro.
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
        const endIso = new Date(
          startDate.getTime() + payload.duracaoMin * 60_000,
        ).toISOString();
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
          patch: { status: "visita_agendada", proximoRetorno: startIso },
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
        const stamp = new Date();
        const prefix = `[${pad(stamp.getDate())}/${pad(stamp.getMonth() + 1)} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}]`;
        const next = atendimento.observacoes
          ? `${atendimento.observacoes}\n${prefix} ${payload.texto}`
          : `${prefix} ${payload.texto}`;
        await updateAtendimento({
          id: atendimento.id,
          patch: { observacoes: next },
        });
        toast.success("Histórico registrado.");
        return;
      }
      if (payload.kind === "motivo-perda") {
        await updateAtendimento({
          id: atendimento.id,
          patch: { status: "perdido", motivoPerda: payload.motivoPerda },
        });
        toast.success("Atendimento marcado como perdido.");
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar ação.");
      throw err;
    }
  }

  function pad(n: number) {
    return String(n).padStart(2, "0");
  }


  function setStatus(status: "todos" | AtendimentoStatus) {
    setFilters((current) => ({ ...current, status }));
  }

  const hasAtendimentos = atendimentos.length > 0;

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

      <AtendimentoFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <AtendimentoSummaryCards
        stats={stats}
        activeStatus={filters.status}
        onStatusChange={setStatus}
        canViewFinancialInsights={canViewFinancialInsights}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Fila de atendimentos</h2>
            <p className="text-[11px] text-foreground/50">
              {filteredAtendimentos.length} atendimento
              {filteredAtendimentos.length === 1 ? "" : "s"} no recorte atual
            </p>
          </div>
          <span className="rounded-full bg-white/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
            Operação comercial
          </span>
        </div>

        {isLoading ? (
          <EmptyState
            title="Carregando atendimentos..."
            description="Buscando registros na nuvem."
            icon={<Inbox className="size-5" />}
          />
        ) : filteredAtendimentos.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredAtendimentos.map((atendimento) => (
              <div
                key={atendimento.id}
                id={`atendimento-${atendimento.id}`}
                className={
                  highlightId === atendimento.id
                    ? "rounded-3xl ring-2 ring-orange-400 ring-offset-2 ring-offset-background transition"
                    : undefined
                }
              >
                <AtendimentoCard
                  atendimento={atendimento}
                  onConvert={handleConvert}
                  onAction={handleAction}
                />
              </div>
            ))}
          </div>

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

      {open && (
        <AtendimentoFormModal open={open} onOpenChange={setOpen} onSubmit={createAtendimento} />
      )}
    </div>
  );
}
