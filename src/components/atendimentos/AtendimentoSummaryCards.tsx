import {
  BadgeDollarSign,
  CalendarCheck2,
  Clock3,
  Handshake,
  Home,
  Inbox,
  MessageCircleMore,
  Send,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  UserX,
} from "lucide-react";
import { formatCompactCurrency } from "@/services/atendimentos";
import type { AtendimentoStatus } from "@/types/atendimento";
import { cn } from "@/lib/utils";

type AtendimentoStats = {
  status: Partial<Record<AtendimentoStatus, number>>;
  compra: number;
  aluguel: number;
  ticketMedio: number;
  leadsMes: number;
};

const pipelineItems = [
  { status: "novo", label: "Novos", icon: Inbox },
  { status: "em_atendimento", label: "Em atendimento", icon: MessageCircleMore },
  { status: "aguardando_retorno", label: "Aguardando", icon: Clock3 },
  { status: "visita_agendada", label: "Visitas", icon: CalendarCheck2 },
  { status: "proposta_enviada", label: "Propostas", icon: Send },
  { status: "negociacao", label: "Negociação", icon: Handshake },
  { status: "fechado", label: "Fechados", icon: UserCheck },
  { status: "perdido", label: "Perdidos", icon: UserX },
  { status: "sem_retorno", label: "Sem retorno", icon: Clock3 },
] as const;

export function AtendimentoSummaryCards({
  stats,
  activeStatus,
  onStatusChange,
}: {
  stats: AtendimentoStats;
  activeStatus: "todos" | AtendimentoStatus;
  onStatusChange: (status: "todos" | AtendimentoStatus) => void;
}) {
  const insights = [
    { label: "Compra", value: stats.compra.toString(), icon: ShoppingBag },
    { label: "Aluguel", value: stats.aluguel.toString(), icon: Home },
    {
      label: "Ticket médio",
      value: stats.ticketMedio ? formatCompactCurrency(stats.ticketMedio) : "A definir",
      icon: BadgeDollarSign,
    },
    { label: "Leads do mês", value: stats.leadsMes.toString(), icon: TrendingUp },
  ];

  return (
    <section className="space-y-2.5" aria-label="Resumo do funil">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-9 lg:px-0">
        {pipelineItems.map((item) => {
          const Icon = item.icon;
          const active = activeStatus === item.status;
          return (
            <button
              key={item.status}
              type="button"
              onClick={() => onStatusChange(active ? "todos" : item.status)}
              className={cn(
                "glass-panel min-w-24 shrink-0 rounded-2xl px-3 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/70 lg:min-w-0",
                active && "bg-teal-700/10 ring-1 ring-teal-700/25",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className={cn("size-3.5", active ? "text-teal-800" : "text-teal-700/65")} />
                <span className="font-mono text-lg font-semibold text-foreground">
                  {stats.status[item.status] ?? 0}
                </span>
              </div>
              <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.09em] text-foreground/48">
                {item.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {insights.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="glass-panel rounded-2xl px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/45">
                  {item.label}
                </span>
                <Icon className="size-3.5 text-amber-600/70" />
              </div>
              <p className="mt-1 truncate font-mono text-base font-semibold text-foreground sm:text-lg">
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
