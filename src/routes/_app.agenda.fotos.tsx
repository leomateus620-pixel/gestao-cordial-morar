import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAgendaReferenceSummaries } from "@/lib/agenda/agenda-attachments.functions";
import { AgendaFeedback, type AgendaFeedbackState } from "@/components/agenda/AgendaFeedback";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { AgendaPhotoFormModal } from "@/components/agenda/AgendaPhotoFormModal";
import { AgendaHero } from "@/components/agenda/AgendaHero";
import {
  AgendaListEmpty,
  AgendaListError,
  AgendaListSkeleton,
} from "@/components/agenda/AgendaListState";
import { AgendaSummaryCards } from "@/components/agenda/AgendaSummaryCards";
import { AgendaTimeline } from "@/components/agenda/AgendaTimeline";

import {
  defaultAgendaFilters,
  hasActiveAgendaFilters,
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
  const [feedback, setFeedback] = useState<AgendaFeedbackState>(null);
  const clientes = useApp((state) => state.clientes);
  const corretores = useApp((state) => state.corretores);
  const canCreate = Boolean(session?.permissions.includes("agenda:write"));
  const {
    filteredEvents,
    stats,
    createEvent,
    editEvent,
    deleteEvent,
    canEdit,
    isLoading,
    isReady,
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
            ? { message: `Sessão “${updated.titulo}” atualizada.` }
            : { message: "Você não pode editar esta sessão de fotos.", tone: "error" },
        );
        return updated;
      }
      const created = await createEvent(photoInput);
      setFeedback({ message: `Sessão “${created.titulo}” agendada.` });
      return created;
    } catch (err) {
      setFeedback({ message: `Não foi possível salvar: ${(err as Error).message}`, tone: "error" });
      throw err;
    }
  }

  async function removeEvent(event: AgendaEvent) {
    try {
      await deleteEvent(event.id);
      setFeedback({ message: `Sessão “${event.titulo}” excluída do sistema e do Google Agenda.` });
      setSelected(undefined);
    } catch (err) {
      setFeedback({
        message: `Não foi possível excluir: ${(err as Error).message}`,
        tone: "error",
      });
      throw err;
    }
  }

  const hasActiveFilters = hasActiveAgendaFilters(filters);

  // Uma única consulta agregada resolve os indicadores de referência da lista.
  const loadReferences = useServerFn(listAgendaReferenceSummaries);
  const eventIds = useMemo(() => filteredEvents.map((item) => item.id), [filteredEvents]);
  const referencesQuery = useQuery({
    queryKey: ["agenda", "references", eventIds.join("|")],
    queryFn: () => loadReferences({ data: { eventIds } }),
    enabled: eventIds.length > 0,
    staleTime: 60_000,
  });
  const referenceLinks = useMemo(
    () =>
      new Set(
        (referencesQuery.data ?? [])
          .filter((item) => Boolean(item.linkUrl))
          .map((item) => item.eventId),
      ),
    [referencesQuery.data],
  );

  return (
    <div className="space-y-4">
      <AgendaHero
        variant="fotos"
        activeCount={isReady ? filteredEvents.length : undefined}
        canCreate={canCreate}
        isCreating={open && !selected}
        onCreate={openCreate}
      />

      <AgendaFilters
        filters={filters}
        onFiltersChange={setFilters}
        people={people}
        clients={clientOptions}
        resultText={
          isReady
            ? `${filteredEvents.length} sess${filteredEvents.length === 1 ? "ão" : "ões"}`
            : undefined
        }
      />

      <AgendaSummaryCards
        variant="fotos"
        stats={stats as never}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <section aria-label="Sessões agendadas">
        {isLoading ? (
          <AgendaListSkeleton />
        ) : isError ? (
          <AgendaListError message={error?.message} onRetry={() => refetch()} />
        ) : filteredEvents.length === 0 ? (
          <AgendaListEmpty
            title="Nenhuma sessão de fotos encontrada"
            description={
              hasActiveFilters
                ? "Nada corresponde ao recorte atual. Ajuste ou limpe os filtros para ver mais."
                : "Nenhuma sessão de fotos ou vídeo agendada. Registre a primeira sessão."
            }
            hasFilters={hasActiveFilters}
            onClearFilters={() => setFilters(defaultAgendaFilters)}
            canCreate={canCreate}
            createLabel="Nova sessão"
            onCreate={openCreate}
          />
        ) : (
          <AgendaTimeline
            events={filteredEvents}
            onOpen={openEvent}
            canEdit={canEdit}
            variant="fotos"
            referenceLinks={referenceLinks}
          />
        )}
      </section>

      <AgendaFeedback feedback={feedback} />

      {open && (
        <AgendaPhotoFormModal
          open={open}
          event={selected}
          onOpenChange={setOpen}
          onSubmit={save}
          onDelete={removeEvent}
          canEdit={selected ? canEdit(selected) : canCreate}
          currentUser={session ? { id: session.id, nome: session.nome } : undefined}
        />
      )}
    </div>
  );
}
