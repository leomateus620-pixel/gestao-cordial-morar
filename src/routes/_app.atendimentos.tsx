import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Inbox, Plus, RefreshCw, Workflow } from "lucide-react";
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
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";
import type { Atendimento, AtendimentoCreateInput, AtendimentoStatus } from "@/types/atendimento";
import type { AgendaEventInput } from "@/types/agenda";

export const Route = createFileRoute("/_app/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const session = useSession();
  const canViewFinancialInsights = canSeeFinancialInsights(session);
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
    refetch,
    addAtendimento,
    convertAtendimento,
    updateAtendimento,
  } = useAttendances(query, filters);

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
      <section className="premium-reveal relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#174d61_0%,#1e647d_52%,#28333b_100%)] p-4 text-white shadow-[0_22px_52px_-26px_rgba(23,27,33,0.55)] sm:p-5">
        <span className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-cyan-200/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cyan-200/13 ring-1 ring-white/10">
              <Inbox className="size-5 text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-300">
                Central de entrada comercial
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Atendimentos</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/68">
                Organize entradas, próximos passos e conversões em uma única fila comercial.
              </p>
              <p className="mt-1.5 hidden items-center gap-1.5 text-[10px] font-semibold text-white/55 md:flex">
                <Workflow className="size-3 text-orange-300" />
                Pré-atendimento · Corretor · Conversão
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="premium-pressable relative inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-orange-300 px-4 text-sm font-semibold text-stone-900 shadow-[0_10px_28px_-14px_rgba(251,146,60,0.65)] ring-1 ring-orange-200/45 transition-[background-color,box-shadow] duration-200 hover:bg-orange-200 hover:shadow-[0_14px_32px_-14px_rgba(251,146,60,0.68)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-900 sm:w-auto"
          >
            <Plus className="size-4" />
            Novo atendimento
          </button>
        </div>
      </section>

      <AtendimentoFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={filteredAtendimentos.length}
      />

      <AtendimentoSummaryCards
        stats={stats}
        activeStatus={filters.status}
        onStatusChange={setStatus}
        canViewFinancialInsights={canViewFinancialInsights}
      />

      <section className="space-y-3" aria-labelledby="attendance-queue-title">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 id="attendance-queue-title" className="text-sm font-semibold tracking-tight">
              Fila de atendimentos
            </h2>
            <p className="text-[11px] text-foreground/50">
              {filteredAtendimentos.length} atendimento
              {filteredAtendimentos.length === 1 ? "" : "s"} no recorte atual
            </p>
          </div>
          <span className="rounded-full border border-white/60 bg-white/48 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-800">
            Atualização em nuvem
          </span>
        </div>

        {isError ? (
          <div
            className="glass-panel rounded-3xl p-6 text-center"
            role="alert"
            aria-live="assertive"
          >
            <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" />
            </div>
            <p className="mt-3 text-sm font-semibold">Não foi possível carregar os atendimentos.</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-foreground/55">
              {error?.message ?? "Verifique sua conexão e tente novamente."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="premium-pressable mt-4 inline-flex min-h-10 items-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:ring-offset-2"
            >
              <RefreshCw className="size-3.5" />
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <AtendimentoListSkeleton />
        ) : filteredAtendimentos.length > 0 ? (
          <div className="premium-stagger grid gap-3 xl:grid-cols-2" aria-live="polite">
            {filteredAtendimentos.map((atendimento) => (
              <AtendimentoCard
                key={atendimento.id}
                atendimento={atendimento}
                onConvert={handleConvert}
                onAction={handleAction}
              />
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
                className="premium-pressable inline-flex min-h-10 items-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-semibold text-white shadow-lg shadow-teal-700/20 transition-colors duration-150 hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:ring-offset-2"
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

function AtendimentoListSkeleton() {
  return (
    <div
      className="grid gap-3 xl:grid-cols-2"
      aria-label="Carregando atendimentos"
      aria-busy="true"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="glass-panel-strong rounded-3xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-white/65 motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/5 animate-pulse rounded-full bg-white/70 motion-reduce:animate-none" />
              <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-white/52 motion-reduce:animate-none" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-white/58 motion-reduce:animate-none" />
          </div>
          <div className="mt-4 h-16 animate-pulse rounded-2xl bg-white/48 motion-reduce:animate-none" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((__, itemIndex) => (
              <div
                key={itemIndex}
                className="h-8 animate-pulse rounded-xl bg-white/45 motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
