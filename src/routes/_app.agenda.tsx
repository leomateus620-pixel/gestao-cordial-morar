import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AgendaCreateCard } from "@/components/agenda/AgendaCreateCard";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { AgendaFormModal } from "@/components/agenda/AgendaFormModal";
import { AgendaSummaryCards } from "@/components/agenda/AgendaSummaryCards";
import { AgendaTimeline } from "@/components/agenda/AgendaTimeline";
import { GoogleCalendarCard } from "@/components/configuracoes/GoogleCalendarCard";
import { SectionHeader } from "@/components/section-header";
import {
  defaultAgendaFilters,
  useAgenda,
  type AgendaFilters as AgendaFiltersState,
} from "@/hooks/useAgenda";
import { mockUsers, useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import type { AgendaEvent, AgendaEventInput } from "@/types/agenda";

export const Route = createFileRoute("/_app/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Gestão Cordial" }] }),
  component: GuardedAgendaPage,
});

function GuardedAgendaPage() {
  return (
    <RequireModuleAccess module="agenda">
      <AgendaPage />
    </RequireModuleAccess>
  );
}

function AgendaPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AgendaEvent | undefined>();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AgendaFiltersState>(defaultAgendaFilters);
  const [feedback, setFeedback] = useState<string | null>(null);
  const clientes = useApp((state) => state.clientes);
  const imoveis = useApp((state) => state.imoveis);
  const corretores = useApp((state) => state.corretores);
  const atendimentos = useApp((state) => state.atendimentos);
  const {
    filteredEvents,
    stats,
    createEvent,
    editEvent,
    canEdit,
    isLoading,
    isError,
    error,
    refetch,
  } = useAgenda(query, filters);

  const people = useMemo(() => {
    const values = [
      ...Object.values(mockUsers).map((user) => ({ id: user.id, nome: user.nome })),
      { id: "bianca", nome: "Bianca" },
      ...corretores.map((broker) => ({ id: broker.id, nome: broker.nome })),
    ];
    return Array.from(new Map(values.map((person) => [person.id, person])).values());
  }, [corretores]);

  const clientOptions = useMemo(
    () => clientes.map((client) => ({ id: client.id, nome: client.nome })),
    [clientes],
  );
  const propertyOptions = useMemo(
    () =>
      imoveis.map((property) => ({
        id: property.id,
        titulo: property.titulo,
        endereco: property.endereco,
      })),
    [imoveis],
  );

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function openCreate() {
    setSelected(undefined);
    setOpen(true);
  }

  function openEvent(event: AgendaEvent) {
    setSelected(event);
    setOpen(true);
  }

  async function save(input: AgendaEventInput) {
    try {
      if (selected) {
        const updated = await editEvent(selected, input);
        setFeedback(
          updated
            ? `Compromisso “${updated.titulo}” atualizado.`
            : "Você não pode editar este compromisso.",
        );
        return;
      }
      const created = await createEvent(input);
      setFeedback(`Compromisso “${created.titulo}” agendado.`);
    } catch (err) {
      setFeedback(`Não foi possível salvar: ${(err as Error).message}`);
      throw err;
    }
  }

  return (
    <div className="space-y-5">
      <AgendaCreateCard
        onClick={openCreate}
        isOpen={open && !selected}
        canCreate={Boolean(session?.permissions.includes("agenda:write"))}
      />

      <AgendaFilters
        filters={filters}
        onFiltersChange={setFilters}
        people={people}
        clients={clientOptions}
        query={query}
        onQueryChange={setQuery}
      />

      <AgendaSummaryCards stats={stats} />

      <section className="space-y-3" aria-labelledby="agenda-list-title" aria-busy={isLoading}>
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800/68">
              Rotina da equipe
            </p>
            <h2 id="agenda-list-title" className="mt-0.5 text-base font-semibold tracking-tight">
              Compromissos
            </h2>
            <p className="mt-0.5 text-xs text-foreground/58">
              {filteredEvents.length} compromisso{filteredEvents.length === 1 ? "" : "s"} no recorte
              atual
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-teal-700/9 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-800 ring-1 ring-teal-700/10">
            {query.trim() ? "Busca ativa" : "Agenda da equipe"}
          </span>
        </div>
        {isLoading ? (
          <div
            role="status"
            className="glass-panel rounded-2xl p-6 text-sm font-medium text-foreground/64"
          >
            Carregando compromissos…
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="glass-panel flex flex-col items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
          >
            <span>Não foi possível carregar a agenda. {error?.message}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="premium-pressable min-h-10 shrink-0 rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/60">
            Nenhum compromisso encontrado para o recorte atual.
          </div>
        ) : (
          <AgendaTimeline events={filteredEvents} onOpen={openEvent} canEdit={canEdit} />
        )}
      </section>

      <section className="border-t border-white/55 pt-4">
        <SectionHeader
          title="Sincronização do calendário"
          description="Conexão secundária para espelhar compromissos no Google Agenda."
          className="mb-2 px-1"
        />
        <GoogleCalendarCard />
      </section>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed left-1/2 top-[max(1.25rem,env(safe-area-inset-top))] z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 bg-white/94 px-4 py-3 text-sm font-semibold text-teal-900 shadow-xl shadow-stone-950/12 backdrop-blur-xl"
        >
          <CheckCircle2 className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          {feedback}
        </div>
      )}

      {open && (
        <AgendaFormModal
          open={open}
          event={selected}
          onOpenChange={setOpen}
          onSubmit={save}
          canEdit={
            selected ? canEdit(selected) : Boolean(session?.permissions.includes("agenda:write"))
          }
          clients={clientOptions}
          atendimentos={atendimentos.map((item) => ({
            id: item.id,
            clienteNome: item.clienteNome,
            imovelDescricao: item.imovelDescricao,
          }))}
          properties={propertyOptions}
          people={people}
          currentUser={session ? { id: session.id, nome: session.nome } : undefined}
        />
      )}
    </div>
  );
}
