import {
  AlarmClock,
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  RefreshCw,
  TriangleAlert,
  UserRound,
  UsersRound,
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

const typeStyles: Record<AgendaTipo, string> = {
  visita: "bg-teal-600/10 text-teal-800",
  fotos: "bg-violet-600/10 text-violet-800",
  video: "bg-orange-500/12 text-orange-800",
  assinatura: "bg-emerald-600/10 text-emerald-800",
  reuniao: "bg-sky-600/10 text-sky-800",
  retorno: "bg-yellow-500/14 text-yellow-800",
  vistoria: "bg-amber-600/12 text-amber-800",
  captacao: "bg-cyan-600/10 text-cyan-800",
  interno: "bg-slate-500/10 text-slate-700",
  outro: "bg-stone-500/10 text-stone-700",
};

const statusStyles: Record<AgendaEvent["status"], string> = {
  agendado: "bg-slate-600/10 text-slate-700 ring-slate-600/10",
  confirmado: "bg-teal-600/12 text-teal-800 ring-teal-600/12",
  em_andamento: "bg-sky-600/12 text-sky-800 ring-sky-600/12",
  concluido: "bg-emerald-600/12 text-emerald-800 ring-emerald-600/12",
  cancelado: "bg-rose-600/10 text-rose-700 ring-rose-600/10",
  reagendado: "bg-amber-600/12 text-amber-800 ring-amber-600/12",
};

export function AgendaEventCard({
  event,
  onClick,
  canEdit,
}: {
  event: AgendaEvent;
  onClick: () => void;
  canEdit: boolean;
}) {
  const start = new Date(event.inicio);
  const end = event.fim ? new Date(event.fim) : undefined;
  const detailsId = `agenda-event-details-${event.id}`;
  const activeReminders = event.lembretes.filter((reminder) => reminder.ativo);

  return (
    <button
      type="button"
      onClick={onClick}
      className="premium-pressable glass-panel group w-full rounded-3xl p-3 text-left hover:bg-white/76 hover:shadow-lg hover:shadow-teal-950/7 sm:p-4"
      aria-label={`${canEdit ? "Editar" : "Ver"} ${event.titulo}`}
      aria-describedby={detailsId}
    >
      <div className="flex gap-3 sm:gap-4">
        <time
          dateTime={event.inicio}
          className="flex w-14 shrink-0 flex-col items-center justify-center self-stretch rounded-2xl bg-white/62 px-1.5 py-3 ring-1 ring-white/70 sm:w-[4.5rem] sm:px-2"
        >
          <span className="font-mono text-base font-semibold leading-none text-teal-950 sm:text-lg">
            {event.diaInteiro
              ? "Dia"
              : start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="mt-1 text-center text-[10px] font-semibold leading-4 text-foreground/58">
            {event.diaInteiro
              ? "inteiro"
              : end
                ? `até ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : `${event.duracaoMin ?? 0} min`}
          </span>
          <span className="mt-2 h-1 w-7 rounded-full bg-orange-300/90 transition-[width] duration-200 group-hover:w-9" />
        </time>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight text-foreground sm:text-base">
                  {event.titulo}
                </h3>
                {!canEdit && (
                  <LockKeyhole
                    className="size-3.5 shrink-0 text-foreground/40"
                    aria-label="Somente leitura"
                  />
                )}
              </div>
              {event.descricao && (
                <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-foreground/56">
                  {event.descricao}
                </p>
              )}
            </div>
            <Badge className={cn("shrink-0 ring-1", statusStyles[event.status])}>
              {agendaStatusLabel[event.status]}
            </Badge>
          </div>

          <div className="mt-2.5 grid gap-1.5 text-xs sm:grid-cols-2">
            <PrimaryInfo
              icon={UserRound}
              text={event.clienteNome || "Sem cliente vinculado"}
              muted={!event.clienteNome}
            />
            <PrimaryInfo
              icon={Building2}
              text={event.imovelDescricao || event.local || "Imóvel ou local a definir"}
              muted={!event.imovelDescricao && !event.local}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge className={typeStyles[event.tipo]}>{agendaTipoLabel[event.tipo]}</Badge>
            <Badge className={priorityStyle(event.prioridade)}>
              {agendaPrioridadeLabel[event.prioridade]}
            </Badge>
            <span className="rounded-full bg-white/62 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-teal-800 ring-1 ring-white/70">
              {agendaImobiliariaLabel[event.imobiliaria]}
            </span>
            <GoogleSyncBadge event={event} />
          </div>

          <div
            id={detailsId}
            className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-white/60 pt-2.5 text-[11px] text-foreground/62 sm:grid-cols-2"
          >
            {event.local && event.local !== event.imovelDescricao && (
              <Info icon={MapPin} text={event.local} />
            )}
            <Info
              icon={CalendarRange}
              text={event.responsavelPrincipalNome || "Responsável a definir"}
            />
            {event.participantes.length > 0 && (
              <Info
                icon={UsersRound}
                text={event.participantes.map((participant) => participant.nome).join(", ")}
              />
            )}
            {activeReminders.length > 0 && (
              <Info
                icon={AlarmClock}
                text={`${activeReminders.length} lembrete${activeReminders.length === 1 ? " ativo" : "s ativos"}`}
              />
            )}
          </div>

          {(event.observacoes || event.atualizadoEm) && (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              {event.observacoes && (
                <span className="min-w-0 flex-1 truncate text-[10px] italic text-foreground/52">
                  “{event.observacoes}”
                </span>
              )}
              <span className="ml-auto hidden shrink-0 items-center gap-1 text-[10px] font-medium text-foreground/45 sm:flex">
                <Clock3 className="size-3" aria-hidden="true" />
                Atualizado {new Date(event.atualizadoEm).toLocaleDateString("pt-BR")}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function GoogleSyncBadge({ event }: { event: AgendaEvent }) {
  const status = event.googleCalendarSyncStatus;
  if (status === "sincronizado") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-emerald-800"
        title="Sincronizado com Google Agenda"
      >
        <CheckCircle2 className="size-3" aria-hidden="true" /> Google
      </span>
    );
  }
  if (status === "preparado") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-rose-800"
        title="Falha na sincronização com o Google"
      >
        <TriangleAlert className="size-3" aria-hidden="true" /> Falha sync
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-400/12 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-slate-700"
      title="Conecte sua conta Google em Configurações para sincronizar"
    >
      <RefreshCw className="size-3" aria-hidden="true" /> Não sincronizado
    </span>
  );
}

function PrimaryInfo({
  icon: Icon,
  text,
  muted,
}: {
  icon: typeof UserRound;
  text: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-xl bg-white/48 px-2.5 py-2 ring-1 ring-white/62",
        muted ? "text-foreground/48" : "font-medium text-foreground/76",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-teal-700/68" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Info({ icon: Icon, text }: { icon: typeof UserRound; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-teal-700/58" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Badge({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] sm:text-[10px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

function priorityStyle(priority: AgendaEvent["prioridade"]) {
  if (priority === "urgente") return "bg-rose-600/11 text-rose-700";
  if (priority === "alta") return "bg-orange-600/11 text-orange-800";
  if (priority === "baixa") return "bg-slate-500/9 text-slate-600";
  return "bg-amber-500/10 text-amber-700";
}
