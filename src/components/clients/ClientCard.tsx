import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import {
  clientCommercialText,
  clientSummaryLine,
  formatBudgetRange,
  getClientInitials,
} from "@/services/clients";
import {
  clientPurposeLabel,
  clientStatusLabel,
  clientTypeLabel,
  leadOriginLabel,
  propertyTypeLabel,
  realEstateBrandLabel,
  type Client,
  type ClientStatus,
} from "@/types/client";
import { cn } from "@/lib/utils";

const statusTone: Record<ClientStatus, string> = {
  novo: "bg-teal-700/10 text-teal-800 ring-teal-700/10",
  em_atendimento: "bg-sky-600/10 text-sky-800 ring-sky-600/10",
  aguardando_retorno: "bg-amber-500/14 text-amber-800 ring-amber-500/12",
  visita_agendada: "bg-indigo-600/10 text-indigo-800 ring-indigo-600/10",
  proposta_enviada: "bg-cyan-600/10 text-cyan-800 ring-cyan-600/10",
  em_negociacao: "bg-violet-600/10 text-violet-800 ring-violet-600/10",
  fechado: "bg-emerald-600/10 text-emerald-800 ring-emerald-600/10",
  perdido: "bg-rose-600/10 text-rose-800 ring-rose-600/10",
  sem_retorno: "bg-zinc-600/10 text-zinc-700 ring-zinc-600/10",
};

function ClientCardImpl({ client }: { client: Client }) {
  const broker = client.assignedBrokerName || "Não definido";
  const nextStep = client.nextStep?.trim() || "Próximo passo não definido";

  return (
    <article className="premium-pressable glass-panel group rounded-3xl p-4 hover:bg-white/66 hover:shadow-lg hover:shadow-teal-950/5 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-700/10 text-sm font-bold text-teal-800 ring-1 ring-white/65 sm:size-12">
          {getClientInitials(client.fullName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight sm:text-base">
                {client.fullName}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-foreground/58">
                {clientSummaryLine(client)}
              </p>
            </div>
            <Badge className={statusTone[client.status]}>{clientStatusLabel(client.status)}</Badge>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-foreground/58">
            <span className="rounded-full bg-white/65 px-2 py-1">
              {clientTypeLabel(client.clientType)}
            </span>
            <span className="rounded-full bg-white/65 px-2 py-1">
              {clientPurposeLabel(client.purpose)}
            </span>
            <span className="rounded-full bg-white/48 px-2 py-1 text-foreground/48">
              {realEstateBrandLabel(client.brand)} · {leadOriginLabel(client.leadOrigin)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-y border-white/52 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-foreground/42">
            Próximo passo
          </p>
          <p
            className={cn(
              "mt-1 line-clamp-2 text-xs font-medium leading-5",
              !client.nextStep && "text-foreground/48",
            )}
          >
            {nextStep}
          </p>
          {client.nextFollowUpAt && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Retorno {formatFollowUp(client.nextFollowUpAt)}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <Info icon={Building2} label="Busca" value={propertyTypeLabel(client.propertyType)} />
          <Info icon={CalendarClock} label="Faixa" value={formatBudgetRange(client)} strong />
          <Info icon={MapPin} label="Região" value={client.neighborhood || "Não informada"} />
          <Info icon={UserRound} label="Responsável" value={broker} />
        </dl>
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-2 text-[11px] text-foreground/60 sm:flex-row sm:items-center sm:gap-4">
        <span className="flex min-w-0 items-center gap-1.5">
          <Phone className="size-3.5 shrink-0 text-teal-700/70" aria-hidden="true" />
          <span className="truncate">{client.phone}</span>
        </span>
        {client.email && (
          <span className="flex min-w-0 items-center gap-1.5">
            <Mail className="size-3.5 shrink-0 text-teal-700/70" aria-hidden="true" />
            <span className="truncate">{client.email}</span>
          </span>
        )}
        <span className="ml-auto hidden items-center gap-1 text-[10px] font-semibold text-teal-800 sm:flex">
          Abrir cadastro
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </span>
      </div>

      {client.notes && (
        <p className="mt-3 line-clamp-2 rounded-2xl bg-white/38 px-3 py-2 text-[11px] leading-5 text-foreground/58">
          {client.notes}
        </p>
      )}

      <span className="sr-only">{clientCommercialText(client)}</span>
    </article>
  );
}

export const ClientCard = memo(ClientCardImpl);

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] ring-1",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  strong,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-foreground/42">
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-foreground/66",
          strong && "font-semibold tabular-nums text-foreground/82",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function formatFollowUp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "programado";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
