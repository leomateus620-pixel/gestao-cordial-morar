import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
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
  const [filters, setFilters] = useState<AgendaFiltersState>(defaultAgendaFilters);
  const [feedback, setFeedback] = useState<string | null>(null);
  const clientes = useApp((state) => state.clientes);
  const imoveis = useApp((state) => state.imoveis);
  const corretores = useApp((state) => state.corretores);
  const atendimentos = useApp((state) => state.atendimentos);
  const { filteredEvents, stats, createEvent, editEvent, canEdit } = useAgenda("", filters);

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
      />

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
