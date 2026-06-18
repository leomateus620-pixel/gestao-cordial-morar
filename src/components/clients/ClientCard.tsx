import { Building2, CalendarClock, Mail, MapPin, Phone, UserRound } from "lucide-react";
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
  type ClientType,
  type LeadOrigin,
  type RealEstateBrand,
} from "@/types/client";
import { cn } from "@/lib/utils";

const clientTypeTone: Record<ClientType, string> = {
  comprador: "bg-teal-700/10 text-teal-800",
  locatario: "bg-sky-600/10 text-sky-800",
  proprietario: "bg-amber-600/12 text-amber-800",
  investidor: "bg-violet-600/10 text-violet-800",
};

const brandTone: Record<RealEstateBrand, string> = {
  cordial: "bg-primary/12 text-primary",
  morar: "bg-amber-500/15 text-amber-800",
  ambas: "bg-teal-700/10 text-teal-800",
};

const statusTone: Record<ClientStatus, string> = {
  novo: "bg-teal-700/10 text-teal-800",
  em_atendimento: "bg-sky-600/10 text-sky-800",
  aguardando_retorno: "bg-amber-500/15 text-amber-800",
  visita_agendada: "bg-indigo-600/10 text-indigo-800",
  proposta_enviada: "bg-cyan-600/10 text-cyan-800",
  em_negociacao: "bg-violet-600/10 text-violet-800",
  fechado: "bg-emerald-600/10 text-emerald-800",
  perdido: "bg-rose-600/10 text-rose-800",
  sem_retorno: "bg-zinc-600/10 text-zinc-700",
};

const originTone: Record<LeadOrigin, string> = {
  whatsapp: "bg-emerald-600/10 text-emerald-800",
  instagram: "bg-fuchsia-600/10 text-fuchsia-800",
  indicacao: "bg-teal-700/10 text-teal-800",
  site: "bg-sky-600/10 text-sky-800",
  portal: "bg-indigo-600/10 text-indigo-800",
  presencial: "bg-amber-600/12 text-amber-800",
  outro: "bg-zinc-600/10 text-zinc-700",
};

function ClientCardImpl({ client }: { client: Client }) {
  const broker = client.assignedBrokerName || "Não definido";

  return (
    <article className="glass-panel rounded-3xl p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white/55 hover:shadow-lg hover:shadow-teal-950/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-700/10 text-sm font-bold text-teal-800 ring-1 ring-white/60">
            {getClientInitials(client.fullName)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight">{client.fullName}</h3>
            <p className="mt-0.5 truncate text-[11px] text-foreground/55">
              {clientSummaryLine(client)}
            </p>
          </div>
        </div>

        <Badge className={statusTone[client.status]}>{clientStatusLabel(client.status)}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className={clientTypeTone[client.clientType]}>
          {clientTypeLabel(client.clientType)}
        </Badge>
        <Badge className="bg-white/65 text-foreground/65">
          {clientPurposeLabel(client.purpose)}
        </Badge>
        <Badge className={brandTone[client.brand]}>{realEstateBrandLabel(client.brand)}</Badge>
        <Badge className={originTone[client.leadOrigin]}>
          {leadOriginLabel(client.leadOrigin)}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-foreground/62">
        <Info icon={Building2} label="Busca" value={propertyTypeLabel(client.propertyType)} />
        <Info icon={MapPin} label="Região" value={client.neighborhood || "Não informada"} />
        <Info icon={UserRound} label="Corretor" value={broker} />
        <Info icon={CalendarClock} label="Faixa" value={formatBudgetRange(client)} strong />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/45 pt-3 text-[11px] text-foreground/58">
        <span className="flex items-center gap-1.5">
          <Phone className="size-3.5 text-teal-700/70" />
          {client.phone}
        </span>
        {client.email && (
          <span className="flex min-w-0 items-center gap-1.5">
            <Mail className="size-3.5 text-teal-700/70" />
            <span className="truncate">{client.email}</span>
          </span>
        )}
      </div>

      {client.notes && (
        <p className="mt-3 line-clamp-2 rounded-2xl bg-white/42 px-3 py-2 text-[11px] leading-5 text-foreground/58">
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
        "rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]",
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
    <div className="rounded-2xl bg-white/42 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/42">
        <Icon className="size-3" />
        {label}
      </dt>
      <dd className={cn("mt-1 truncate", strong && "font-mono font-semibold text-foreground/82")}>
        {value}
      </dd>
    </div>
  );
}
