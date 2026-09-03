import {
  BellRing,
  Building2,
  CheckCircle2,
  Flag,
  LockKeyhole,
  MapPin,
  RefreshCw,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import {
  agendaImobiliariaLabel,
  agendaPrioridadeLabel,
  agendaStatusLabel,
  agendaTipoLabel,
  type AgendaEvent,
  type AgendaTipo,
} from "@/types/agenda";
import { cn } from "@/lib/utils";

/** Accent used for the left rail and the type dot, keyed by event type. */
const typeAccent: Record<AgendaTipo, string> = {
  visita: "bg-teal-600",
  fotos: "bg-violet-500",
  video: "bg-orange-500",
  assinatura: "bg-emerald-600",
  reuniao: "bg-sky-600",
  retorno: "bg-amber-500",
  vistoria: "bg-amber-700",
  captacao: "bg-cyan-600",
  interno: "bg-slate-500",
  outro: "bg-stone-500",
};

const statusStyles: Record<AgendaEvent["status"], string> = {
  agendado: "bg-slate-500/10 text-slate-700 ring-slate-500/15",
  confirmado: "bg-teal-600/12 text-teal-800 ring-teal-600/15",
  em_andamento: "bg-sky-600/12 text-sky-800 ring-sky-600/15",
  concluido: "bg-emerald-600/12 text-emerald-800 ring-emerald-600/15",
  cancelado: "bg-rose-600/10 text-rose-700 ring-rose-600/15",
  reagendado: "bg-amber-600/12 text-amber-800 ring-amber-600/15",
};

const imobiliariaStyles: Record<AgendaEvent["imobiliaria"], string> = {
  cordial: "bg-[var(--cordial-light)] text-[var(--cordial-dark)]",
  morar: "bg-[var(--morar-light)] text-[var(--morar-dark)]",
  ambas: "bg-foreground/6 text-foreground/65",
};

export function AgendaEventCard({
  event,
  onClick,
  canEdit,
  past = false,
}: {
  event: AgendaEvent;
  onClick: () => void;
  canEdit: boolean;
  /** Softens cards that already happened so the upcoming ones stand out. */
  past?: boolean;
}) {
  const start = new Date(event.inicio);
  const end = event.fim ? new Date(event.fim) : undefined;
  const ownerName = event.responsavelPrincipalNome || event.criadoPorNome;
  const property = event.imovelDescricao || event.imovelNome;
  const location = event.local && event.local !== property ? event.local : undefined;
  const activeReminders = event.lembretes.filter((reminder) => reminder.ativo).length;
  const highPriority = event.prioridade === "alta" || event.prioridade === "urgente";
  const cancelled = event.status === "cancelado";
  const done = event.status === "concluido";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "agenda-event-card glass-panel group relative w-full overflow-hidden rounded-[1.35rem] p-3.5 pl-4 text-left",
        "transition duration-200 hover:-translate-y-0.5 hover:bg-white/72 hover:shadow-lg hover:shadow-teal-950/8 active:scale-[0.995]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50",
        (past || cancelled) && "opacity-80 hover:opacity-100",
      )}
      aria-label={`${canEdit ? "Editar" : "Ver"} ${event.titulo}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-3.5 left-0 w-[3px] rounded-r-full transition-all duration-200 group-hover:inset-y-2.5",
          typeAccent[event.tipo],
          (cancelled || done) && "opacity-50",
        )}
      />

      <div className="flex gap-3.5">
        <div className="flex w-12 shrink-0 flex-col pt-0.5 text-left sm:w-14">
          <span
            className={cn(
              "font-mono text-[15px] font-semibold leading-none tabular-nums tracking-tight sm:text-base",
              cancelled ? "text-foreground/45 line-through" : "text-teal-950",
            )}
          >
            {event.diaInteiro
              ? "Dia"
              : start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="mt-1 text-[10px] font-medium leading-tight text-foreground/45">
            {event.diaInteiro
              ? "inteiro"
              : end
                ? `até ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : event.duracaoMin
                  ? `${event.duracaoMin} min`
                  : ""}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  "line-clamp-2 text-[13.5px] font-semibold leading-snug tracking-tight sm:text-sm",
                  cancelled && "text-foreground/55 line-through",
                )}
              >
                {event.titulo}
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-foreground/55">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 rounded-full", typeAccent[event.tipo])}
                  />
                  {agendaTipoLabel[event.tipo]}
                </span>
                {highPriority && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-semibold",
                      event.prioridade === "urgente" ? "text-rose-700" : "text-orange-700",
                    )}
                  >
                    <Flag className="size-3" />
                    {agendaPrioridadeLabel[event.prioridade]}
                  </span>
                )}
                {event.descricao && (
                  <span className="hidden min-w-0 flex-1 truncate text-foreground/45 sm:inline">
                    {event.descricao}
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {!canEdit && (
                <LockKeyhole className="size-3.5 text-foreground/35" aria-label="Somente leitura" />
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ring-1",
                  statusStyles[event.status],
                )}
              >
                {agendaStatusLabel[event.status]}
              </span>
            </div>
          </div>

          {(event.clienteNome || property || location) && (
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-foreground/62">
              {event.clienteNome && <Info icon={UserRound} text={event.clienteNome} />}
              {property && <Info icon={Building2} text={property} />}
              {location && <Info icon={MapPin} text={location} />}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/60 pt-2.5">
            {ownerName && (
              <span
                className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground/70"
                title={`Responsável: ${ownerName}`}
              >
                <Avatar name={ownerName} />
                <span className="truncate">{ownerName}</span>
                {event.participantes.length > 0 && (
                  <span
                    className="rounded-full bg-foreground/6 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-foreground/55"
                    title={event.participantes.map((participant) => participant.nome).join(", ")}
                  >
                    +{event.participantes.length}
                  </span>
                )}
              </span>
            )}

            <span className="ml-auto flex items-center gap-1.5">
              {activeReminders > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-foreground/45"
                  title={`${activeReminders} lembrete${activeReminders === 1 ? "" : "s"} ativo${activeReminders === 1 ? "" : "s"}`}
                >
                  <BellRing className="size-3" />
                  {activeReminders}
                </span>
              )}
              <GoogleSyncIndicator event={event} />
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",
                  imobiliariaStyles[event.imobiliaria],
                )}
              >
                {agendaImobiliariaLabel[event.imobiliaria]}
              </span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function GoogleSyncIndicator({ event }: { event: AgendaEvent }) {
  const status = event.googleCalendarSyncStatus;
  if (status === "sincronizado") {
    return (
      <span
        className="grid size-5 place-items-center rounded-full bg-emerald-600/12 text-emerald-700"
        title="Sincronizado com o Google Agenda"
        aria-label="Sincronizado com o Google Agenda"
      >
        <CheckCircle2 className="size-3" />
      </span>
    );
  }
  if (status === "preparado") {
    const detail = event.googleCalendarSyncError
      ? `Não chegou ao Google Agenda — ${event.googleCalendarSyncError}`
      : "Falha na sincronização com o Google Agenda";
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700"
        title={detail}
      >
        <TriangleAlert className="size-3" /> Falha sync
      </span>
    );
  }
  return (
    <span
      className="grid size-5 place-items-center rounded-full bg-foreground/5 text-foreground/35"
      title="Não sincronizado — conecte sua conta Google em Configurações"
      aria-label="Não sincronizado com o Google Agenda"
    >
      <RefreshCw className="size-3" />
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-700/12 text-[8.5px] font-bold text-teal-900 ring-1 ring-white/70"
    >
      {initials}
    </span>
  );
}

function Info({ icon: Icon, text }: { icon: typeof UserRound; text: string }) {
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-teal-700/55" />
      <span className="truncate">{text}</span>
    </span>
  );
}
