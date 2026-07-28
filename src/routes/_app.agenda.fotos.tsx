import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { AgendaCreateCard } from "@/components/agenda/AgendaCreateCard";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { AgendaFormModal } from "@/components/agenda/AgendaFormModal";
import { AgendaSummaryCards } from "@/components/agenda/AgendaSummaryCards";
import { AgendaTimeline } from "@/components/agenda/AgendaTimeline";
import { AgendaViewSwitcher } from "@/components/agenda/AgendaViewSwitcher";

import {
  defaultAgendaFilters,
  useAgenda,
  type AgendaFilters as AgendaFiltersState,
} from "@/hooks/useAgenda";
import { mockUsers, useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import type { AgendaEvent, AgendaEventInput } from "@/types/agenda";

export const Route = createFileRoute("/_app/agenda/fotos")({
  head: () => ({
    meta: [
      { title: "Agenda de fotos — Gestão Cordial" },
      {
        name: "description",
        content:
          "Agenda compartilhada de sessões de fotos e vídeos dos imóveis captados pela imobiliária.",
      },
    ],
  }),
  component: GuardedFotosPage,
});

function GuardedFotosPage() {
  return (
    <RequireModuleAccess module="agenda">
      <AgendaFotosPage />
    </RequireModuleAccess>
  );
}

function AgendaFotosPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AgendaEvent | undefined>();
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
  } = useAgenda("", filters, { scope: "fotos" });

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
    // Ensure any event created from this view is a photo/video appointment
    // so it stays visible to every operational user through the shared RLS path.
    const photoInput: AgendaEventInput =
      input.tipo === "fotos" || input.tipo === "video" ? input : { ...input, tipo: "fotos" };
    try {
      if (selected) {
        const updated = await editEvent(selected, photoInput);
        setFeedback(
          updated
            ? `Sessão “${updated.titulo}” atualizada.`
            : "Você não pode editar esta sessão de fotos.",
        );
        return;
      }
      const created = await createEvent(photoInput);
      setFeedback(`Sessão “${created.titulo}” agendada.`);
    } catch (err) {
      setFeedback(`Não foi possível salvar: ${(err as Error).message}`);
      throw err;
    }
  }

  return (
    <div className="space-y-4">
      <AgendaViewSwitcher />

      <section className="glass-panel flex items-start gap-3 rounded-2xl border border-fuchsia-200/40 bg-gradient-to-br from-fuchsia-50/60 via-white/70 to-white/60 p-4 shadow-sm">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-fuchsia-100 text-fuchsia-700 ring-1 ring-fuchsia-200/60">
          <Camera className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Agenda de fotos
          </h1>
          <p className="mt-0.5 text-[12px] text-foreground/60">
            Sessões de fotos e vídeos dos imóveis. Visível para toda a equipe operacional; edição
            restrita ao responsável, criador, secretaria e admin.
          </p>
        </div>
      </section>

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

      <AgendaSummaryCards variant="fotos" stats={stats as never} />


      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Sessões agendadas</h2>
            <p className="text-[11px] text-foreground/50">
              {filteredEvents.length} sessã{filteredEvents.length === 1 ? "o" : "os"} no recorte
              atual
            </p>
          </div>
          <span className="rounded-full bg-fuchsia-100/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-fuchsia-800">
            Agenda compartilhada
          </span>
        </div>
        {isLoading ? (
          <div className="glass-panel rounded-2xl p-6 text-sm text-foreground/60">
            Carregando sessões…
          </div>
        ) : isError ? (
          <div className="glass-panel flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <span>Não foi possível carregar a agenda de fotos. {error?.message}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/60">
            Nenhuma sessão de fotos encontrada para o recorte atual.
          </div>
        ) : (
          <AgendaTimeline events={filteredEvents} onOpen={openEvent} canEdit={canEdit} />
        )}
      </section>

      {feedback && (
        <div className="fixed left-1/2 top-5 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm font-semibold text-fuchsia-900 shadow-xl shadow-stone-950/12 backdrop-blur-xl">
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
          people={people}
          currentUser={session ? { id: session.id, nome: session.nome } : undefined}
        />
      )}
    </div>
  );
}
