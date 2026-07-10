import {
  Archive,
  BadgeDollarSign,
  CalendarCheck2,
  Clock3,
  Handshake,
  Home,
  Inbox,
  LayoutList,
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
  { status: "arquivado", label: "Arquivados", icon: Archive },
] as const;

export function AtendimentoSummaryCards({
  stats,
  activeStatus,
  onStatusChange,
  canViewFinancialInsights = true,
}: {
  stats: AtendimentoStats;
  activeStatus: "todos" | AtendimentoStatus;
  onStatusChange: (status: "todos" | AtendimentoStatus) => void;
  canViewFinancialInsights?: boolean;
}) {
  const total = Object.values(stats.status).reduce((sum, value) => sum + (value ?? 0), 0);
  const insights = [
    { label: "Leads do mês", value: stats.leadsMes.toString(), icon: TrendingUp },
    { label: "Interesse em compra", value: stats.compra.toString(), icon: ShoppingBag },
    { label: "Interesse em aluguel", value: stats.aluguel.toString(), icon: Home },
    ...(canViewFinancialInsights
      ? [
          {
            label: "Ticket médio",
            value: stats.ticketMedio ? formatCompactCurrency(stats.ticketMedio) : "A definir",
            icon: BadgeDollarSign,
          },
        ]
      : []),
  ];

  return (
    <section className="space-y-3" aria-label="Resumo do funil comercial">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Etapas do funil</h2>
          <p className="text-[11px] text-foreground/48">Selecione uma etapa para filtrar a fila</p>
        </div>
        {activeStatus !== "todos" && (
          <button
            type="button"
            onClick={() => onStatusChange("todos")}
            className="shrink-0 rounded-xl px-2.5 py-2 text-[11px] font-semibold text-teal-800 transition-colors duration-150 hover:bg-teal-700/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35"
          >
            Ver todos
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
        <PipelineButton
          label="Todos"
          value={total}
          icon={LayoutList}
          active={activeStatus === "todos"}
          onClick={() => onStatusChange("todos")}
        />
        {pipelineItems.map((item) => (
          <PipelineButton
            key={item.status}
            label={item.label}
            value={stats.status[item.status] ?? 0}
            icon={item.icon}
            active={activeStatus === item.status}
            onClick={() => onStatusChange(activeStatus === item.status ? "todos" : item.status)}
          />
        ))}
      </div>

      <div className="glass-panel grid grid-cols-2 overflow-hidden rounded-2xl sm:grid-cols-4">
        {insights.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={cn(
                "min-w-0 px-3 py-3 sm:px-4",
                index % 2 === 1 && "border-l border-white/55",
                index >= 2 && "border-t border-white/55 sm:border-t-0 sm:border-l",
              )}
            >
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.11em] text-foreground/45">
                <Icon className="size-3.5 shrink-0 text-amber-700/70" />
                <span className="truncate">{item.label}</span>
              </div>
              <p className="mt-1 truncate text-base font-semibold tabular-nums text-foreground sm:text-lg">
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PipelineButton({
  label,
  value,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "premium-pressable min-w-28 shrink-0 rounded-2xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35 lg:min-w-0",
        active
          ? "border-teal-700/25 bg-teal-700 text-white shadow-lg shadow-teal-900/14"
          : "glass-panel border-white/55 text-foreground hover:bg-white/72",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className={cn("size-3.5", active ? "text-orange-200" : "text-teal-700/65")} />
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[9px] font-bold uppercase tracking-[0.08em]",
          active ? "text-white/75" : "text-foreground/48",
        )}
      >
        {label}
      </p>
    </button>
  );
}
