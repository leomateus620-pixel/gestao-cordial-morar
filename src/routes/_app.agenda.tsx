import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, Cloud, UsersRound } from "lucide-react";
import { AgendaCreateCard } from "@/components/agenda/AgendaCreateCard";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { AgendaFormModal } from "@/components/agenda/AgendaFormModal";
import { AgendaSummaryCards } from "@/components/agenda/AgendaSummaryCards";
import { AgendaTimeline } from "@/components/agenda/AgendaTimeline";
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
  component: AgendaPage,
});

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
  const { filteredEvents, stats, createEvent, editEvent, canEdit } = useAgenda(query, filters);

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

  function save(input: AgendaEventInput) {
    if (selected) {
      const updated = editEvent(selected, input);
      setFeedback(
        updated
          ? `Compromisso “${updated.titulo}” atualizado.`
          : "Você não pode editar este compromisso.",
      );
      return;
    }
    const created = createEvent(input);
    setFeedback(`Compromisso “${created.titulo}” agendado.`);
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#164d5e_0%,#176b70_52%,#29363d_100%)] p-5 text-white shadow-[0_24px_60px_-24px_rgba(23,27,33,0.55)] sm:p-6">
        <span className="absolute -right-12 -top-20 size-52 rounded-full bg-cyan-200/11 blur-3xl" />
        <span className="absolute -bottom-20 left-1/3 size-44 rounded-full bg-orange-300/8 blur-3xl" />
        <div className="relative flex items-start gap-3 sm:items-center">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-200/13 ring-1 ring-white/10">
            <CalendarCheck2 className="size-6 text-orange-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-300">
              Central operacional da equipe
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">Agenda</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-white/68">
              Organize visitas, retornos, fotos, vídeos, assinaturas e compromissos da equipe.
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-2 text-[10px] font-semibold text-white/68 ring-1 ring-white/10">
              <UsersRound className="size-3.5 text-orange-300" />
              Equipe coordenada
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-2 text-[10px] font-semibold text-white/68 ring-1 ring-white/10">
              <Cloud className="size-3.5 text-cyan-200" />
              Integrações preparadas
            </span>
          </div>
        </div>
      </section>

      <AgendaFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        people={people}
        clients={clientOptions}
      />

      {session?.permissions.includes("agenda:write") && (
        <AgendaCreateCard onClick={openCreate} isOpen={open && !selected} />
      )}

      <AgendaSummaryCards stats={stats} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Compromissos</h2>
            <p className="text-[11px] text-foreground/50">
              {filteredEvents.length} compromisso{filteredEvents.length === 1 ? "" : "s"} no recorte
              atual
            </p>
          </div>
          <span className="rounded-full bg-white/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
            Agenda da equipe
          </span>
        </div>
        <AgendaTimeline events={filteredEvents} onOpen={openEvent} canEdit={canEdit} />
      </section>

      {feedback && (
        <div className="fixed left-1/2 top-5 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm font-semibold text-teal-900 shadow-xl shadow-stone-950/12 backdrop-blur-xl">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
          {feedback}
        </div>
      )}

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
    </div>
  );
}
