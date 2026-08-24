import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AgendaCreateCard } from "@/components/agenda/AgendaCreateCard";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { AgendaFormModal } from "@/components/agenda/AgendaFormModal";
import { AgendaSummaryCards } from "@/components/agenda/AgendaSummaryCards";
import { AgendaTimeline } from "@/components/agenda/AgendaTimeline";
import { AgendaViewSwitcher } from "@/components/agenda/AgendaViewSwitcher";
import { GoogleCalendarCard } from "@/components/configuracoes/GoogleCalendarCard";

import {
  defaultAgendaFilters,
  useAgenda,
  type AgendaFilters as AgendaFiltersState,
} from "@/hooks/useAgenda";
import { mockUsers, useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import type { AgendaEvent, AgendaEventInput, AgendaStatus } from "@/types/agenda";
import { agendaStatusOptions } from "@/types/agenda";

type OperationalPeriod = "mes" | "ultimos_30" | "trimestre" | "ano";

export const Route = createFileRoute("/_app/agenda/")({
  head: () => ({ meta: [{ title: "Visitas e compromissos — Gestão Cordial" }] }),
  validateSearch: (
    search: {
      id?: unknown;
      corretorId?: unknown;
      periodo?: unknown;
      imobiliaria?: unknown;
      status?: unknown;
    } & SearchSchemaInput,
  ) => ({
    id: typeof search.id === "string" ? search.id : undefined,
    corretorId: parseBrokerId(search.corretorId),
    periodo: parseOperationalPeriod(search.periodo),
    imobiliaria: parseAgency(search.imobiliaria),
    status: parseAgendaStatus(search.status),
  }),
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
  const { id: highlightedId, corretorId, periodo, imobiliaria, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AgendaEvent | undefined>();
  const [filters, setFilters] = useState<AgendaFiltersState>(() => ({
    ...defaultAgendaFilters,
    ...buildAgendaContextFilters({ corretorId, periodo, imobiliaria, status }),
  }));
  const [feedback, setFeedback] = useState<string | null>(null);
  const unavailableDeepLink = useRef<string | null>(null);
  const clientes = useApp((state) => state.clientes);
  const imoveis = useApp((state) => state.imoveis);
  const corretores = useApp((state) => state.corretores);
  const atendimentos = useApp((state) => state.atendimentos);
  const {
    events,
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
  } = useAgenda("", filters, { scope: "geral" });

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      ...buildAgendaContextFilters({ corretorId, periodo, imobiliaria, status }),
    }));
  }, [corretorId, imobiliaria, periodo, status]);

  useEffect(() => {
    if (!highlightedId || isError) return;
    const event = events.find((item) => item.id === highlightedId);
    if (!event) {
      // Só concluir "indisponível" depois de uma carga concluída com sucesso.
      if (isLoading || !isReady) return;
      if (unavailableDeepLink.current !== highlightedId) {
        unavailableDeepLink.current = highlightedId;
        setFeedback("Compromisso indisponível ou sem permissão para este usuário.");
      }
      return;
    }
    unavailableDeepLink.current = null;
    setSelected(event);
    setOpen(true);
  }, [events, highlightedId, isError, isLoading, isReady]);


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

  async function removeEvent(event: AgendaEvent) {
    try {
      await deleteEvent(event.id);
      setFeedback(`Compromisso “${event.titulo}” excluído do sistema e do Google Agenda.`);
      setSelected(undefined);
    } catch (err) {
      setFeedback(`Não foi possível excluir: ${(err as Error).message}`);
      throw err;
    }
  }


  return (
    <div className="space-y-4">
      <GoogleCalendarCard variant="inline" />

      <AgendaViewSwitcher activeCount={filteredEvents.length} />

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

      <AgendaSummaryCards
        variant="geral"
        stats={stats as never}
        filters={filters}
        onFiltersChange={setFilters}
      />

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
        {isLoading ? (
          <div className="glass-panel rounded-2xl p-6 text-sm text-foreground/60">
            Carregando compromissos…
          </div>
        ) : isError ? (
          <div className="glass-panel flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <span>Não foi possível carregar a agenda. {error?.message}</span>
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
            Nenhum compromisso encontrado para o recorte atual.
          </div>
        ) : (
          <AgendaTimeline events={filteredEvents} onOpen={openEvent} canEdit={canEdit} />
        )}
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
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen && highlightedId) {
              void navigate({
                to: ".",
                search: { corretorId, periodo, imobiliaria, status },
                replace: true,
              });
            }
          }}
          onSubmit={save}
          onDelete={removeEvent}
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

const BROKER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationalPeriods = new Set<OperationalPeriod>(["mes", "ultimos_30", "trimestre", "ano"]);
const agendaStatuses = new Set<AgendaStatus>(agendaStatusOptions.map((option) => option.value));

function parseBrokerId(value: unknown) {
  return typeof value === "string" && BROKER_ID_PATTERN.test(value) ? value : undefined;
}

function parseOperationalPeriod(value: unknown): OperationalPeriod | undefined {
  return typeof value === "string" && operationalPeriods.has(value as OperationalPeriod)
    ? (value as OperationalPeriod)
    : undefined;
}

function parseAgency(value: unknown): "todas" | "cordial" | "morar" | undefined {
  return value === "todas" || value === "cordial" || value === "morar" ? value : undefined;
}

function parseAgendaStatus(value: unknown): AgendaStatus | undefined {
  return typeof value === "string" && agendaStatuses.has(value as AgendaStatus)
    ? (value as AgendaStatus)
    : undefined;
}

function buildAgendaContextFilters({
  corretorId,
  periodo,
  imobiliaria,
  status,
}: {
  corretorId?: string;
  periodo?: OperationalPeriod;
  imobiliaria?: "todas" | "cordial" | "morar";
  status?: AgendaStatus;
}): Partial<AgendaFiltersState> {
  const periodFilters = getAgendaPeriodFilters(periodo);
  return {
    corretorContexto: corretorId ?? "todos",
    responsavel: "todos",
    imobiliaria: imobiliaria ?? "todas",
    status: status ?? "todos",
    ...periodFilters,
  };
}

function getAgendaPeriodFilters(
  period?: OperationalPeriod,
): Pick<AgendaFiltersState, "periodo" | "dataInicio" | "dataFim"> {
  if (!period) return { periodo: "todos", dataInicio: "", dataFim: "" };
  if (period === "mes") return { periodo: "mes", dataInicio: "", dataFim: "" };

  const now = new Date();
  let start: Date;
  let end: Date;

  if (period === "ultimos_30") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    end = now;
  } else if (period === "trimestre") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterStartMonth, 1);
    end = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }

  return {
    periodo: "personalizado",
    dataInicio: formatDateInput(start),
    dataFim: formatDateInput(end),
  };
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
