import {
  Check,
  Clock3,
  KeyRound,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memoryPreferences } from "@/lib/agent/memory.schemas";
import { routineProposal } from "@/lib/agent/routines.schemas";
import { RichToolResult } from "./RichResults";
import { useSession } from "@/lib/auth-mock";
import {
  listAssistantRoutines,
  prepareAssistantRoutine,
  saveAssistantRoutine,
  setAssistantRoutineState,
  deleteAssistantRoutine,
  getAssistantRoutineRun,
} from "@/lib/agent/routines.functions";
import {
  listAssistantMemory,
  saveAssistantMemory,
  deleteAssistantMemory,
} from "@/lib/agent/memory.functions";
import {
  getAssistantReadiness,
  beginAssistantDelegation,
  revokeAssistantDelegation,
} from "@/lib/agent/delegation.functions";

export type RoutineProposalView = {
  name: string;
  template: string;
  hour: number;
  minute: number;
  timeZone: "America/Sao_Paulo";
  days: "every_day" | "weekdays" | "weekly";
  dayOfWeek?: number;
};
export type RoutineView = RoutineProposalView & {
  id: string;
  status: "active" | "paused" | "needs_reauthorization";
  nextRunAt: string | null;
  lastRun?: unknown;
  runs?: Array<{
    id: string;
    status: string;
    scheduledAt: string;
    finishedAt?: string | null;
    attempts: number;
  }>;
};
export type ReadinessView = {
  status: "ready" | "not_configured" | "needs_reauthorization";
  delegation: "connected" | "missing" | "revoked";
  schedulerEnabled: boolean;
  missing: string[];
};
export type PreferencesView = {
  tone: "curto" | "acolhedor" | "formal";
  focusNeighborhoods: string[];
  preferredStart: string;
  preferredEnd: string;
};
export const defaultPreferences: PreferencesView = {
  tone: "curto",
  focusNeighborhoods: [],
  preferredStart: "08:00",
  preferredEnd: "18:00",
};
const templates: Record<string, string> = {
  daily_briefing: "Seu dia",
  agenda_today: "Agenda do dia",
  stale_attendances: "Atendimentos parados",
  expiring_agenciamentos: "Pendências de captação",
  rentals_overdue: "Aluguéis em atraso",
  new_matches: "Novos matches",
  broker_ranking: "Equipe",
  market_digest: "Mercado imobiliário",
};
const templateBot: Record<string, string> = {
  daily_briefing: "agenda",
  agenda_today: "agenda",
  stale_attendances: "lead",
  expiring_agenciamentos: "capta",
  rentals_overdue: "caixa",
  new_matches: "match",
  broker_ranking: "time",
  market_digest: "mercado",
};
const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
const dateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const runLabel = (status: string) =>
  ({
    completed: "Concluída",
    succeeded: "Concluída",
    executed: "Concluída",
    failed: "Falhou",
    running: "Em andamento",
    pending: "Na fila",
    retrying: "Nova tentativa",
  })[status] ?? "Registrada";

export function ConnectionPanelView({
  readiness,
  loading = false,
  busy = false,
  error,
  onConnect,
  onRevoke,
  onRefresh,
}: {
  readiness?: ReadinessView;
  loading?: boolean;
  busy?: boolean;
  error?: string;
  onConnect?: () => void;
  onRevoke?: () => void;
  onRefresh?: () => void;
}) {
  const [disconnect, setDisconnect] = useState(false);
  if (loading)
    return (
      <div
        className="assistant-skeleton h-20"
        role="status"
        aria-label="Consultando conexão das rotinas"
      />
    );
  if (!readiness)
    return (
      <div role="alert" className="rounded-2xl border border-border p-4">
        <p className="text-xs text-muted-foreground">Conexão indisponível.</p>
        <button type="button" className="assistant-small-button mt-3" onClick={onRefresh}>
          <RotateCcw size={12} />
          Tentar novamente
        </button>
      </div>
    );
  const ready = readiness.status === "ready" && readiness.delegation === "connected";
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      aria-label="Conexão das rotinas"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/7 text-primary">
          <KeyRound size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold">
            {ready
              ? "Rotinas conectadas"
              : readiness.status === "not_configured"
                ? "Configuração pendente"
                : "Conecte suas rotinas"}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {ready
              ? readiness.schedulerEnabled
                ? "Prontas para os horários combinados."
                : "Agendador aguardando ativação."
              : readiness.status === "not_configured"
                ? "O administrador precisa concluir a configuração."
                : "Autorize consultas com os seus acessos, mesmo fora do Gestão."}
          </p>
        </div>
        {ready ? (
          <button
            type="button"
            className="assistant-icon-button"
            aria-label="Desconectar rotinas"
            onClick={() => setDisconnect(true)}
            disabled={busy}
          >
            <Unplug size={15} />
          </button>
        ) : (
          readiness.status !== "not_configured" && (
            <button
              type="button"
              className="assistant-small-button !bg-primary !text-primary-foreground"
              disabled={busy || !onConnect}
              onClick={onConnect}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
              Conectar
            </button>
          )
        )}
      </div>
      {disconnect && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <p className="w-full text-xs">Desconectar e interromper consultas agendadas?</p>
          <button
            className="assistant-small-button"
            type="button"
            onClick={() => setDisconnect(false)}
          >
            Cancelar
          </button>
          <button
            className="assistant-small-button text-destructive"
            type="button"
            onClick={() => {
              onRevoke?.();
              setDisconnect(false);
            }}
            disabled={busy}
          >
            Desconectar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export function RoutinesPanelView({
  routines,
  readiness,
  loading = false,
  error,
  busy = false,
  proposal,
  onPrepare,
  onSave,
  onState,
  onDelete,
  onClearProposal,
  onEdit,
  connection,
  selectedRoutineId,
}: {
  routines: RoutineView[];
  readiness?: ReadinessView;
  loading?: boolean;
  error?: string;
  busy?: boolean;
  proposal?: RoutineProposalView;
  onPrepare?: (message: string) => void;
  onSave?: (proposal: RoutineProposalView) => void;
  onState?: (routine: RoutineView) => void;
  onDelete?: (id: string) => void;
  onClearProposal?: () => void;
  onEdit?: (routine: RoutineView) => void;
  connection?: React.ReactNode;
  selectedRoutineId?: string;
}) {
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<string>();
  return (
    <div className="assistant-conversation space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Rotinas</h2>
        <Clock3 size={18} className="text-primary/60" />
      </div>
      {connection}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim()) onPrepare?.(message);
        }}
        className="flex gap-2"
      >
        <input
          className={inputClass}
          aria-label="Descreva uma rotina"
          placeholder="Todo dia às 8h, resuma minha agenda"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          disabled={busy}
        />
        <button
          type="submit"
          className="assistant-small-button !rounded-xl !bg-primary !px-4 !text-primary-foreground"
          disabled={busy || !message.trim() || !onPrepare}
          aria-label="Preparar rotina"
        >
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Plus size={16} />}
        </button>
      </form>
      {proposal && (
        <RoutineProposalCard
          key={`${proposal.name}:${proposal.hour}:${proposal.minute}`}
          proposal={proposal}
          busy={busy}
          onConfirm={onSave}
          onCancel={onClearProposal}
        />
      )}{" "}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <div role="status" aria-label="Carregando rotinas" className="assistant-skeleton h-24" />
      ) : !routines.length && !error ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <Clock3 className="mx-auto mb-3 size-6 text-primary/45" />
          <p className="text-sm font-semibold">Nenhuma rotina ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map((routine) => (
            <article
              key={routine.id}
              id={`assistant-routine-${routine.id}`}
              className={`rounded-2xl border bg-card p-4 ${selectedRoutineId === routine.id ? "border-primary/50" : "border-border"}`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{routine.name}</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {routine.days === "weekdays"
                      ? "Dias úteis"
                      : routine.days === "weekly"
                        ? ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][routine.dayOfWeek ?? 0]
                        : "Todo dia"}{" "}
                    · {String(routine.hour).padStart(2, "0")}:
                    {String(routine.minute).padStart(2, "0")} · Brasília
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[9px] text-muted-foreground">
                  {routine.status === "active"
                    ? "Ativa"
                    : routine.status === "paused"
                      ? "Pausada"
                      : "Reconectar"}
                </span>
              </div>
              {routine.nextRunAt && routine.status === "active" && (
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Próxima: {dateTime(routine.nextRunAt)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  className="assistant-small-button"
                  type="button"
                  onClick={() => onState?.(routine)}
                  disabled={busy || !onState || routine.status === "needs_reauthorization"}
                >
                  {routine.status === "active" ? <Pause size={12} /> : <Play size={12} />}{" "}
                  {routine.status === "active" ? "Pausar" : "Retomar"}
                </button>
                <button
                  className="assistant-small-button"
                  type="button"
                  onClick={() => onEdit?.(routine)}
                  disabled={busy || !onEdit}
                >
                  <Pencil size={12} />
                  Editar
                </button>
                <button
                  className="assistant-icon-button !size-8"
                  type="button"
                  aria-label={`Excluir rotina ${routine.name}`}
                  onClick={() => setRemoving(routine.id)}
                  disabled={busy}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {removing === routine.id && (
                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <p className="flex-1 text-[11px]">Excluir esta rotina?</p>
                  <button
                    type="button"
                    className="assistant-small-button"
                    onClick={() => setRemoving(undefined)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="assistant-small-button text-destructive"
                    onClick={() => {
                      onDelete?.(routine.id);
                      setRemoving(undefined);
                    }}
                    disabled={busy}
                  >
                    Excluir
                  </button>
                </div>
              )}
              {!!routine.runs?.length && (
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-[10px] text-muted-foreground">
                    Últimas execuções
                  </summary>
                  <ol className="mt-3 space-y-2">
                    {routine.runs.slice(0, 5).map((run) => (
                      <li
                        key={run.id}
                        className="flex justify-between gap-3 text-[10px] text-muted-foreground"
                      >
                        <a
                          href={`/assistente?routine=${routine.id}&run=${run.id}`}
                          className="text-primary"
                        >
                          {dateTime(run.scheduledAt)}
                        </a>
                        <span>{runLabel(run.status)}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
export function RoutineProposalCard({
  proposal,
  busy,
  onConfirm,
  onCancel,
}: {
  proposal: RoutineProposalView;
  busy?: boolean;
  onConfirm?: (proposal: RoutineProposalView) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(proposal);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm?.(draft);
      }}
      className="rounded-2xl border border-primary/25 bg-primary/3 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Revisar rotina</h3>
        <button
          type="button"
          aria-label="Cancelar proposta de rotina"
          className="assistant-icon-button !size-7"
          onClick={onCancel}
        >
          <X size={14} />
        </button>
      </div>
      <label className="mt-4 grid gap-2 text-[11px]">
        Nome
        <input
          className={inputClass}
          maxLength={100}
          required
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {templates[draft.template] ?? "Rotina"}
        </span>
        <label className="flex items-center gap-2 text-[11px]">
          Brasília
          <input
            aria-label="Horário da rotina em Brasília"
            type="time"
            className={inputClass}
            required
            value={`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`}
            onChange={(e) => {
              const [hour, minute] = e.target.value.split(":").map(Number);
              setDraft({ ...draft, hour, minute });
            }}
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="grid gap-2 text-[11px]">
          Frequência
          <select
            className={inputClass}
            value={draft.days}
            onChange={(event) =>
              setDraft({
                ...draft,
                days: event.target.value as RoutineProposalView["days"],
                ...(event.target.value === "weekly"
                  ? { dayOfWeek: draft.dayOfWeek ?? 1 }
                  : { dayOfWeek: undefined }),
              })
            }
          >
            <option value="every_day">Todos os dias</option>
            <option value="weekdays">Dias úteis</option>
            <option value="weekly">Semanalmente</option>
          </select>
        </label>
        {draft.days === "weekly" && (
          <label className="grid gap-2 text-[11px]">
            Dia
            <select
              className={inputClass}
              value={draft.dayOfWeek ?? 1}
              onChange={(event) => setDraft({ ...draft, dayOfWeek: Number(event.target.value) })}
            >
              {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(
                (day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
      </div>
      <button
        className="assistant-small-button mt-4 !bg-primary !px-4 !text-primary-foreground"
        disabled={busy || !onConfirm}
        type="submit"
      >
        {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}Confirmar
        rotina
      </button>
    </form>
  );
}

export function MemoryPanelView({
  preferences = defaultPreferences,
  loading = false,
  busy = false,
  error,
  onSave,
  onDelete,
  updatedAt,
}: {
  preferences?: PreferencesView;
  loading?: boolean;
  busy?: boolean;
  error?: string;
  onSave?: (preferences: PreferencesView) => void;
  onDelete?: () => void;
  updatedAt?: string | null;
}) {
  const [draft, setDraft] = useState(preferences);
  const [neighborhoods, setNeighborhoods] = useState(preferences.focusNeighborhoods.join(", "));
  const [clear, setClear] = useState(false);
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.preferredEnd <= draft.preferredStart) {
      setValidation("O fim precisa ser depois do início.");
      return;
    }
    setValidation("");
    try {
      onSave?.(
        memoryPreferences.parse({
          ...draft,
          focusNeighborhoods: neighborhoods
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      );
    } catch (err) {
      setValidation(
        err && typeof err === "object" && "issues" in err
          ? String((err.issues as { message: string }[])[0]?.message ?? "Revise suas preferências.")
          : "Revise suas preferências.",
      );
    }
  }
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Preferências</h2>
        {updatedAt && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Atualizadas em {dateTime(updatedAt)}
          </p>
        )}
      </div>
      {loading ? (
        <div
          role="status"
          aria-label="Carregando preferências"
          className="assistant-skeleton h-40"
        />
      ) : (
        <form onSubmit={submit} className="grid gap-5">
          <label className="grid gap-2 text-[11px] font-medium">
            Como prefere as respostas?
            <select
              className={inputClass}
              value={draft.tone}
              onChange={(e) =>
                setDraft({ ...draft, tone: e.target.value as PreferencesView["tone"] })
              }
            >
              <option value="curto">Curtas e diretas</option>
              <option value="acolhedor">Acolhedoras</option>
              <option value="formal">Formais</option>
            </select>
          </label>
          <label className="grid gap-2 text-[11px] font-medium">
            Bairros de foco
            <input
              className={inputClass}
              placeholder="Centro, Cruzeiro…"
              maxLength={500}
              value={neighborhoods}
              onChange={(e) => setNeighborhoods(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium">Seu horário · Brasília</legend>
            <div className="grid grid-cols-2 gap-3">
              {["preferredStart", "preferredEnd"].map((key, index) => (
                <label key={key} className="grid gap-2 text-[10px] text-muted-foreground">
                  {index === 0 ? "Início" : "Fim"}
                  <input
                    type="time"
                    required
                    className={inputClass}
                    value={draft[key as "preferredStart" | "preferredEnd"]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {(error || validation) && (
            <p role="alert" className="text-xs text-destructive">
              {validation || error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="assistant-small-button !bg-primary !px-4 !text-primary-foreground"
              disabled={busy || !onSave}
            >
              {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}Guardar
              preferências
            </button>
            <button
              type="button"
              className="assistant-small-button text-muted-foreground"
              onClick={() => setClear(true)}
              disabled={busy || !onDelete}
            >
              <Trash2 size={12} />
              Apagar
            </button>
          </div>
          {clear && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
              <span className="w-full text-xs">Apagar as preferências guardadas?</span>
              <button
                type="button"
                className="assistant-small-button"
                onClick={() => setClear(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="assistant-small-button text-destructive"
                onClick={() => {
                  onDelete?.();
                  setClear(false);
                }}
              >
                Apagar preferências
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

export function useAssistantControls(botId?: string, runId?: string) {
  const session = useSession();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<RoutineProposalView>();
  const [editingId, setEditingId] = useState<string>();
  const [proposalRequestId, setProposalRequestId] = useState<string>();
  const selectedRun = useQuery({
    queryKey: ["assistant-run", session?.id, runId],
    queryFn: () => getAssistantRoutineRun({ data: { id: runId! } }),
    enabled: !!session && !!runId,
  });
  const routines = useQuery({
    queryKey: ["assistant-routines", session?.id],
    queryFn: () => listAssistantRoutines({ data: { limit: 20 } }),
    enabled: !!session,
    refetchInterval: 30000,
  });
  const memory = useQuery({
    queryKey: ["assistant-memory", session?.id],
    queryFn: () => listAssistantMemory(),
    enabled: !!session,
  });
  const readiness = useQuery({
    queryKey: ["assistant-readiness", session?.id],
    queryFn: () => getAssistantReadiness(),
    enabled: !!session,
    staleTime: 30000,
  });
  async function run(task: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      void qc.invalidateQueries({ queryKey: ["assistant-routines"] });
      void qc.invalidateQueries({ queryKey: ["assistant-memory"] });
      void qc.invalidateQueries({ queryKey: ["assistant-readiness"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir agora.");
    } finally {
      setBusy(false);
    }
  }
  const connection = (
    <ConnectionPanelView
      readiness={readiness.data as ReadinessView | undefined}
      loading={readiness.isLoading}
      busy={busy}
      error={error}
      onRefresh={() => void readiness.refetch()}
      onConnect={() =>
        void run(async () => {
          const result = await beginAssistantDelegation();
          const url = new URL(result.authorizationUrl);
          if (url.protocol !== "https:") throw new Error("Endereço de autorização inválido.");
          window.location.assign(url.href);
        })
      }
      onRevoke={() => void run(() => revokeAssistantDelegation({ data: { confirmed: true } }))}
    />
  );
  const routineRows = (routines.data?.routines ?? []) as RoutineView[];
  return {
    connection,
    memory,
    readiness,
    busy,
    error,
    proposal,
    routines,
    selectedRun,
    routineRows: botId
      ? routineRows.filter((row) => templateBot[row.template] === botId)
      : routineRows,
    prepare: (message: string) =>
      void run(async () => {
        const result = await prepareAssistantRoutine({ data: { message } });
        setEditingId(undefined);
        setProposal(result.proposal as RoutineProposalView);
        setProposalRequestId(result.requestId);
      }),
    save: (value: RoutineProposalView) =>
      void run(async () => {
        await saveAssistantRoutine({
          data: {
            id: editingId,
            requestId: proposalRequestId,
            proposal: routineProposal.parse(value),
            confirmed: true,
          },
        });
        setProposal(undefined);
        setEditingId(undefined);
      }),
    edit: (routine: RoutineView) => {
      setEditingId(routine.id);
      setProposalRequestId(undefined);
      setProposal({
        name: routine.name,
        template: routine.template,
        hour: routine.hour,
        minute: routine.minute,
        timeZone: routine.timeZone,
        days: routine.days,
        dayOfWeek: routine.dayOfWeek,
      });
    },
    setState: (routine: RoutineView) =>
      void run(() =>
        setAssistantRoutineState({
          data: {
            id: routine.id,
            status: routine.status === "active" ? "paused" : "active",
            confirmed: true,
          },
        }),
      ),
    remove: (id: string) =>
      void run(() => deleteAssistantRoutine({ data: { id, confirmed: true } })),
    clearProposal: () => {
      setProposal(undefined);
      setEditingId(undefined);
    },
    saveMemory: (preferences: PreferencesView) =>
      void run(() => saveAssistantMemory({ data: { preferences, confirmed: true } })),
    deleteMemory: () => void run(() => deleteAssistantMemory({ data: { confirmed: true } })),
  };
}

export function RoutineRunResult({
  run,
  loading = false,
  error = false,
}: {
  run?: {
    status: string;
    scheduledAt: string;
    items: Array<{ tool: string; data: Record<string, any> }>;
  };
  loading?: boolean;
  error?: boolean;
}) {
  if (loading)
    return (
      <div className="assistant-skeleton h-24" role="status" aria-label="Carregando execução" />
    );
  if (error)
    return (
      <p
        role="alert"
        className="rounded-2xl border border-border p-4 text-xs text-muted-foreground"
      >
        Não foi possível consultar esta execução no seu acesso atual.
      </p>
    );
  if (!run) return null;
  return (
    <section className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex justify-between gap-2 text-xs font-semibold">
        <span>Execução · {dateTime(run.scheduledAt)}</span>
        <span className="text-muted-foreground">{runLabel(run.status)}</span>
      </div>
      {run.items.map((item, index) => (
        <RichToolResult key={index} result={item} />
      ))}
    </section>
  );
}

export function RoutineProposalResult({
  proposal,
  requestId,
}: {
  proposal: RoutineProposalView;
  requestId?: string;
}) {
  const control = useAssistantControls();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"saved" | "cancelled">();
  return (
    <div className="mt-4 space-y-3">
      {outcome ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-primary/5 p-4 text-xs">
          <Check size={14} />
          {outcome === "saved" ? "Rotina criada." : "Proposta cancelada."}
        </p>
      ) : (
        <RoutineProposalCard
          proposal={proposal}
          busy={busy}
          onCancel={() => setOutcome("cancelled")}
          onConfirm={async (draft) => {
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await saveAssistantRoutine({
                data: { proposal: routineProposal.parse(draft), requestId, confirmed: true },
              });
              setOutcome("saved");
              void qc.invalidateQueries({ queryKey: ["assistant-routines"] });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Não foi possível criar a rotina.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}{" "}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!outcome && control.readiness.data?.status !== "ready" && control.connection}
    </div>
  );
}
export function MemoryProposalResult({ preferences }: { preferences: PreferencesView }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className="mt-4 rounded-2xl border border-border p-4">
      {saved ? (
        <p role="status" className="flex items-center gap-2 text-xs">
          <Check size={14} />
          Preferências guardadas.
        </p>
      ) : (
        <MemoryPanelView
          preferences={preferences}
          busy={busy}
          error={error}
          onSave={async (draft) => {
            setBusy(true);
            setError("");
            try {
              await saveAssistantMemory({
                data: { preferences: memoryPreferences.parse(draft), confirmed: true },
              });
              setSaved(true);
              void qc.invalidateQueries({ queryKey: ["assistant-memory"] });
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Não foi possível guardar as preferências.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
