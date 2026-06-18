import {
  AlarmClock,
  Building2,
  CalendarRange,
  Clock3,
  LockKeyhole,
  MapPin,
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
  visita: "bg-teal-600/12 text-teal-800",
  fotos: "bg-violet-600/12 text-violet-800",
  video: "bg-orange-500/14 text-orange-800",
  assinatura: "bg-emerald-600/12 text-emerald-800",
  reuniao: "bg-sky-600/12 text-sky-800",
  retorno: "bg-yellow-500/16 text-yellow-800",
  vistoria: "bg-amber-600/14 text-amber-800",
  captacao: "bg-cyan-600/12 text-cyan-800",
  interno: "bg-slate-500/12 text-slate-700",
  outro: "bg-stone-500/12 text-stone-700",
};

const statusStyles: Record<AgendaEvent["status"], string> = {
  agendado: "bg-slate-500/10 text-slate-700",
  confirmado: "bg-teal-600/12 text-teal-800",
  em_andamento: "bg-sky-600/12 text-sky-800",
  concluido: "bg-emerald-600/12 text-emerald-800",
  cancelado: "bg-rose-600/10 text-rose-700",
  reagendado: "bg-amber-600/12 text-amber-800",
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
  const property = event.imovelDescricao || event.local;

  return (
    <button
      type="button"
      onClick={onClick}
      className="agenda-event-card glass-panel group w-full rounded-3xl p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-white/72 hover:shadow-lg hover:shadow-teal-950/8 active:scale-[0.995] sm:p-4"
      aria-label={`${canEdit ? "Editar" : "Ver"} ${event.titulo}`}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/52 px-2 py-3 ring-1 ring-white/65 sm:w-20">
          <span className="font-mono text-base font-semibold text-teal-900 sm:text-lg">
            {event.diaInteiro
              ? "Dia"
              : start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="mt-0.5 text-[9px] font-semibold text-foreground/45">
            {event.diaInteiro
              ? "inteiro"
              : end
                ? `até ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : `${event.duracaoMin ?? 0} min`}
          </span>
          <span className="mt-2 h-1 w-8 rounded-full bg-orange-300/90 transition-all group-hover:w-11" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold tracking-tight sm:text-base">
                  {event.titulo}
                </h3>
                {!canEdit && <LockKeyhole className="size-3.5 shrink-0 text-foreground/35" />}
              </div>
              {event.descricao && (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-foreground/48">
                  {event.descricao}
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Badge className={typeStyles[event.tipo]}>{agendaTipoLabel[event.tipo]}</Badge>
              <Badge className={statusStyles[event.status]}>
                {agendaStatusLabel[event.status]}
              </Badge>
              <Badge className={priorityStyle(event.prioridade)}>
                {agendaPrioridadeLabel[event.prioridade]}
              </Badge>
            </div>
          </div>

          <div className="mt-3 grid gap-x-5 gap-y-2 text-[11px] text-foreground/58 sm:grid-cols-2 xl:grid-cols-3">
            <Info icon={UserRound} text={event.clienteNome || "Sem cliente vinculado"} />
            <Info icon={Building2} text={property || "Sem imóvel/local definido"} />
            <Info icon={MapPin} text={event.local || "Local a definir"} />
            <Info
              icon={CalendarRange}
              text={event.responsavelPrincipalNome || "Responsável a definir"}
            />
            <Info
              icon={UsersRound}
              text={
                event.participantes.length
                  ? event.participantes.map((participant) => participant.nome).join(", ")
                  : "Sem participantes adicionais"
              }
            />
            <Info
              icon={AlarmClock}
              text={
                event.lembretes.some((reminder) => reminder.ativo)
                  ? `${event.lembretes.filter((reminder) => reminder.ativo).length} lembrete(s) ativo(s)`
                  : "Sem lembrete"
              }
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/55 pt-2.5">
            <span className="rounded-full bg-white/50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-teal-800 ring-1 ring-white/65">
              {agendaImobiliariaLabel[event.imobiliaria]}
            </span>
            {event.observacoes && (
              <span className="min-w-0 flex-1 truncate text-[10px] italic text-foreground/44">
                “{event.observacoes}”
              </span>
            )}
            <span className="ml-auto hidden items-center gap-1 text-[9px] font-semibold text-foreground/38 sm:flex">
              <Clock3 className="size-3" />
              Atualizado {new Date(event.atualizadoEm).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function Info({ icon: Icon, text }: { icon: typeof UserRound; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-teal-700/55" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Badge({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] sm:text-[9px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

function priorityStyle(priority: AgendaEvent["prioridade"]) {
  if (priority === "urgente") return "bg-rose-600/12 text-rose-700";
  if (priority === "alta") return "bg-orange-600/12 text-orange-800";
  if (priority === "baixa") return "bg-slate-500/10 text-slate-600";
  return "bg-amber-500/12 text-amber-700";
}
