import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Loader2,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { pipelineStageOptions } from "@/types/atendimento";
import { parseActionPayload, type ActionProposal } from "@/lib/agent/actions";
import {
  cancelAssistantAction,
  confirmAssistantAction,
  editAssistantAction,
  listAssistantActions,
  getAssistantAction,
} from "@/lib/agent/actions.functions";
import { safeRecordHref } from "./RichResults";

export type ActionViewState =
  | "pending"
  | "confirmed"
  | "executed"
  | "failed"
  | "cancelled"
  | "expired";
export function actionViewState(
  action: Pick<ActionProposal, "status" | "expiresAt">,
  now = Date.now(),
): ActionViewState {
  return action.status === "pending" && Date.parse(action.expiresAt) <= now
    ? "expired"
    : action.status;
}
const statusLabels: Record<ActionViewState, string> = {
  pending: "Precisa de você",
  confirmed: "Confirmando",
  executed: "Concluído",
  failed: "Não concluído",
  cancelled: "Cancelado",
  expired: "Expirado",
};
const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ActionCardView({
  action,
  now = Date.now(),
  busy = false,
  error,
  onConfirm,
  onEdit,
  onCancel,
  onRefresh,
}: {
  action: ActionProposal;
  now?: number;
  busy?: boolean;
  error?: string;
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onRefresh?: () => void;
}) {
  const state = actionViewState(action, now);
  const instanceId = useId().replace(/:/g, "");
  const [copied, setCopied] = useState(false);
  const href = safeRecordHref(action.result?.href);
  return (
    <article
      id={`assistant-action-${action.id}-${instanceId}`}
      data-action-id={action.id}
      className="assistant-action-card rounded-2xl border border-border bg-card p-4"
      aria-label={action.title}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${state === "executed" ? "bg-emerald-500/10 text-emerald-700" : "bg-primary/7 text-primary"}`}
        >
          {state === "executed" ? (
            <CheckCheck size={15} />
          ) : busy || state === "confirmed" ? (
            <Loader2 className="animate-spin" size={15} />
          ) : (
            <Clock3 size={15} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">{action.title}</h3>
            <span className="text-[9px] font-medium text-muted-foreground" role="status">
              {busy ? "Atualizando…" : statusLabels[state]}
            </span>
          </div>
          {action.summary && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.summary}</p>
          )}
        </div>
      </div>
      {state !== "cancelled" && action.diff.length > 0 && (
        <dl className="mt-4 divide-y divide-border/70 rounded-xl bg-muted/30 px-3">
          {action.diff.map((field, index) => (
            <div
              key={`${field.label}${index}`}
              className="grid grid-cols-[minmax(70px,.65fr)_minmax(0,1fr)] gap-3 py-2.5 text-[11px]"
            >
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 break-words">
                {field.before && field.before !== field.after && (
                  <span className="mr-2 text-muted-foreground line-through">{field.before}</span>
                )}
                <span className="font-medium">{field.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {state === "pending" && (
        <p className="mt-3 text-[9px] text-muted-foreground">
          Disponível até {time(action.expiresAt)}
        </p>
      )}
      {action.result?.text && <p className="mt-3 text-xs leading-relaxed">{action.result.text}</p>}
      {state === "executed" && action.result?.draft && (
        <div className="mt-3 rounded-xl bg-muted/40 p-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed">{action.result.draft}</p>
          <button
            type="button"
            className="assistant-small-button mt-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(action.result!.draft!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}{" "}
            {copied ? "Copiado" : "Copiar rascunho"}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {state === "pending" && (
          <>
            <button
              type="button"
              className="assistant-small-button !border-primary !bg-primary !px-4 !text-primary-foreground"
              disabled={busy || !onConfirm}
              onClick={onConfirm}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Confirmar
            </button>
            <button
              type="button"
              className="assistant-small-button"
              onClick={onEdit}
              disabled={busy || !onEdit}
            >
              <Pencil size={12} />
              Editar
            </button>
            <button
              type="button"
              className="assistant-small-button !border-transparent !text-muted-foreground"
              onClick={onCancel}
              disabled={busy || !onCancel}
            >
              <X size={12} />
              Cancelar
            </button>
          </>
        )}
        {href && state === "executed" && (
          <a href={href} className="assistant-small-button text-primary">
            Abrir registro
            <ArrowUpRight size={12} />
          </a>
        )}
        {(state === "confirmed" || state === "failed" || error) && onRefresh && (
          <button
            type="button"
            className="assistant-small-button"
            onClick={onRefresh}
            disabled={busy}
          >
            <RotateCcw size={12} />
            Verificar resultado
          </button>
        )}
        {state === "expired" && (
          <span className="text-[11px] text-muted-foreground">
            Peça uma nova proposta para continuar.
          </span>
        )}
      </div>
    </article>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
function localDateTime(iso: unknown) {
  if (typeof iso !== "string") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(" ", "T");
}
export function ActionEditor({
  action,
  onSave,
  busy = false,
  error,
}: {
  action: ActionProposal;
  onSave: (payload: Record<string, unknown>) => void;
  busy?: boolean;
  error?: string;
}) {
  const [payload, setPayload] = useState<Record<string, unknown>>({ ...action.payload });
  const [validation, setValidation] = useState("");
  const set = (key: string, value: unknown) => setPayload((old) => ({ ...old, [key]: value }));
  const textField = (
    key: string,
    label: string,
    options: { textarea?: boolean; required?: boolean; max?: number } = {},
  ) => (
    <label className="grid gap-2 text-[11px] font-medium">
      {label}
      {options.textarea ? (
        <textarea
          className={inputClass}
          rows={4}
          maxLength={options.max ?? 2000}
          required={options.required}
          value={String(payload[key] ?? "")}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          maxLength={options.max ?? 120}
          required={options.required}
          value={String(payload[key] ?? "")}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </label>
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    try {
      onSave(parseActionPayload(action.type, payload) as Record<string, unknown>);
    } catch (error) {
      setValidation(
        error && typeof error === "object" && "issues" in error
          ? String((error.issues as { message: string }[])[0]?.message ?? "Revise os campos.")
          : "Revise os campos.",
      );
    }
  }
  const properties = Array.isArray(payload.propertyIds) ? (payload.propertyIds as string[]) : [];
  return (
    <form onSubmit={submit} className="mt-6 grid gap-5">
      {action.type === "agenda_event" ? (
        <>
          {textField("title", "Título", { required: true })}
          <div className="grid grid-cols-2 gap-3">
            {["start", "end"].map((key) => (
              <label key={key} className="grid gap-2 text-[11px] font-medium">
                {key === "start" ? "Início" : "Fim"}
                <input
                  type="datetime-local"
                  required
                  className={inputClass}
                  value={localDateTime(payload[key])}
                  onChange={(e) =>
                    set(
                      key,
                      e.target.value ? new Date(`${e.target.value}:00-03:00`).toISOString() : "",
                    )
                  }
                />
              </label>
            ))}
          </div>
          {textField("notes", "Observações", { textarea: true })}
        </>
      ) : action.type === "attendance_note" || action.type === "message_draft" ? (
        textField("text", action.type === "attendance_note" ? "Nota de atendimento" : "Rascunho", {
          textarea: true,
          required: true,
          max: 4000,
        })
      ) : action.type === "attendance_stage_change" ? (
        <>
          <label className="grid gap-2 text-[11px] font-medium">
            Nova etapa
            <select
              className={inputClass}
              value={String(payload.to)}
              onChange={(e) => set("to", e.target.value)}
            >
              {pipelineStageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {textField("reason", "Motivo", { textarea: true })}
        </>
      ) : action.type === "shared_selection" ? (
        <>
          {textField("title", "Título", { required: true })}
          {textField("publicMessage", "Mensagem da seleção", { textarea: true, max: 1000 })}
          <label className="grid gap-2 text-[11px] font-medium">
            Validade
            <select
              className={inputClass}
              value={String(payload.expiresDays)}
              onChange={(e) => set("expiresDays", Number(e.target.value))}
            >
              {[7, 15, 30, 60].map((days) => (
                <option key={days} value={days}>
                  {days} dias
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium">Imóveis · {properties.length}</legend>
            {properties.map((id, index) => (
              <div key={id} className="flex items-center gap-2 border-b border-border py-2">
                <span className="flex-1 text-[11px] text-muted-foreground">Imóvel {index + 1}</span>
                <a
                  href={`/imoveis/${id}`}
                  className="assistant-icon-button !size-7"
                  aria-label={`Abrir imóvel ${index + 1}`}
                >
                  <ArrowUpRight size={13} />
                </a>
                {[-1, 1].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    className="assistant-icon-button !size-7"
                    aria-label={delta < 0 ? "Subir imóvel" : "Descer imóvel"}
                    disabled={index + delta < 0 || index + delta >= properties.length}
                    onClick={() => {
                      const ids = [...properties];
                      [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
                      set("propertyIds", ids);
                    }}
                  >
                    {delta < 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  </button>
                ))}
                <button
                  type="button"
                  className="assistant-icon-button !size-7"
                  aria-label={`Remover imóvel ${index + 1}`}
                  disabled={properties.length === 1}
                  onClick={() =>
                    set(
                      "propertyIds",
                      properties.filter((value) => value !== id),
                    )
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </fieldset>
        </>
      ) : null}
      {(validation || error) && (
        <p role="alert" className="text-xs text-destructive">
          {validation || error}
        </p>
      )}
      <button
        type="submit"
        className="assistant-small-button !rounded-full !bg-primary !py-3 !text-primary-foreground"
        disabled={busy}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Atualizar
        proposta
      </button>
      <p className="text-center text-[10px] text-muted-foreground">
        Você confirma a nova versão depois de revisar.
      </p>
    </form>
  );
}

export function AssistantActionCard({ action }: { action: ActionProposal }) {
  const qc = useQueryClient();
  const actionKey = ["assistant-action", action.id];
  const cached = useQuery({
    queryKey: actionKey,
    queryFn: async () => action,
    initialData: action,
    enabled: false,
  });
  const current = cached.data;
  const access = useQuery({
    queryKey: ["assistant-action-access", action.id],
    queryFn: async () => false,
    initialData: false,
    enabled: false,
  });
  const setUnavailable = (value: boolean) =>
    qc.setQueryData(["assistant-action-access", action.id], value);
  const setCurrent = (value: ActionProposal) => {
    qc.setQueryData(actionKey, value);
    qc.setQueriesData<ActionProposal>(
      {
        predicate: (query) =>
          query.queryKey[0] === "assistant-action" && query.queryKey.includes(value.id),
      },
      value,
    );
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    qc.setQueryData<ActionProposal>(["assistant-action", action.id], (previous) =>
      !previous ||
      action.revision > previous.revision ||
      (previous.status === "pending" && action.status !== "pending")
        ? action
        : previous,
    );
  }, [action, qc]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  async function mutate(kind: "confirm" | "cancel" | "edit", payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = { actionId: current.id, revision: current.revision };
      const next =
        kind === "confirm"
          ? await confirmAssistantAction({ data })
          : kind === "cancel"
            ? await cancelAssistantAction({ data })
            : await editAssistantAction({ data: { ...data, payload } });
      setCurrent(next as ActionProposal);
      setUnavailable(false);
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["assistant-actions"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a proposta.");
      // Resolve an uncertain outcome by reading, never by repeating the write.
      try {
        setCurrent(await getAssistantAction({ data: { actionId: current.id } }));
        setUnavailable(false);
      } catch {
        setUnavailable(true);
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const next = await getAssistantAction({ data: { actionId: current.id } });
      setCurrent(next);
      setUnavailable(false);
      setError("");
    } catch {
      setError("Não foi possível verificar o resultado agora.");
      setUnavailable(true);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }
  if (access.data)
    return (
      <section
        data-action-id={action.id}
        className="rounded-2xl border border-border bg-muted/30 p-4"
        role="alert"
      >
        <p className="text-sm">Não foi possível consultar esta proposta com seu acesso atual.</p>
        <button
          type="button"
          className="assistant-small-button mt-3"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "Verificando…" : "Verificar acesso"}
        </button>
      </section>
    );
  return (
    <>
      <ActionCardView
        action={current}
        now={now}
        busy={busy}
        error={error}
        onConfirm={() => void mutate("confirm")}
        onCancel={() => void mutate("cancel")}
        onEdit={() => setEditing(true)}
        onRefresh={() => void refresh()}
      />
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent
          closeLabel="Fechar edição"
          className="assistant-panel !w-full !max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-lg">Editar proposta</SheetTitle>
            <SheetDescription className="text-xs">{current.title}</SheetDescription>
          </SheetHeader>
          <ActionEditor
            key={current.revision}
            action={current}
            busy={busy}
            error={error}
            onSave={(payload) => void mutate("edit", payload)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
