import { AlertCircle, BadgeDollarSign, Home, ShoppingBag, TrendingUp } from "lucide-react";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import { formatCompactCurrency } from "@/services/atendimentos";
import {
  ACTIVE_PIPELINE_STAGES,
  pipelineStageLabel,
  type AtendimentoStatus,
  type PipelineStage,
} from "@/types/atendimento";
import { cn } from "@/lib/utils";

type AtendimentoStats = {
  status: Partial<Record<AtendimentoStatus, number>>;
  pipeline: Partial<Record<PipelineStage, number>>;
  overdue: number;
  compra: number;
  aluguel: number;
  ticketMedio: number;
  leadsMes: number;
};

export function AtendimentoSummaryCards({
  stats,
  selectedStage,
  onStageChange,
  canViewFinancialInsights = true,
}: {
  stats: AtendimentoStats;
  selectedStage: PipelineStage;
  onStageChange: (stage: PipelineStage) => void;
  canViewFinancialInsights?: boolean;
}) {
  const insights = [
    { label: "Compra", value: stats.compra.toString(), icon: ShoppingBag },
    { label: "Aluguel", value: stats.aluguel.toString(), icon: Home },
    ...(canViewFinancialInsights
      ? [
          {
            label: "Ticket médio",
            value: stats.ticketMedio ? formatCompactCurrency(stats.ticketMedio) : "A definir",
            icon: BadgeDollarSign,
          },
        ]
      : []),
    { label: "Leads do mês", value: stats.leadsMes.toString(), icon: TrendingUp },
    {
      label: "Retornos atrasados",
      value: stats.overdue.toString(),
      icon: AlertCircle,
      danger: stats.overdue > 0,
    },
  ];

  return (
    <section className="space-y-3" aria-label="Resumo do funil">
      <div>
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.17em] text-teal-800/65">
              Navegação principal
            </p>
            <h2 className="mt-0.5 text-sm font-extrabold tracking-tight text-stone-900">
              Etapas do funil
            </h2>
          </div>
          <p className="hidden text-[10px] font-medium text-stone-500 sm:block">
            Acompanhe o volume e priorize cada etapa do atendimento.
          </p>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
          {ACTIVE_PIPELINE_STAGES.map((stage) => {
            const ui = pipelineStageUi[stage];
            const active = selectedStage === stage;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => onStageChange(stage)}
                className={cn(
                  "min-w-40 shrink-0 rounded-2xl border bg-white/78 px-3.5 py-3 text-left shadow-[0_10px_26px_-24px_rgba(31,41,55,0.9)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_28px_-22px_rgba(31,41,55,0.7)] lg:min-w-0",
                  active ? cn(ui.badge, "shadow-sm") : "border-stone-900/10 text-stone-700",
                )}
                aria-pressed={active}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] opacity-60">
                    Etapa {ui.order}
                  </span>
                  <span className="font-mono text-xl font-extrabold">
                    {stats.pipeline[stage] ?? 0}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] font-extrabold">
                  {pipelineStageLabel(stage)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:px-0",
          insights.length >= 5 ? "sm:grid-cols-5" : "sm:grid-cols-4",
        )}
      >
        {insights.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={cn(
                "min-w-32 shrink-0 rounded-2xl border bg-white/58 px-3 py-2.5 sm:min-w-0",
                item.danger ? "border-rose-700/18 bg-rose-50/65" : "border-stone-900/8",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[8px] font-extrabold uppercase tracking-[0.11em] text-stone-500">
                  {item.label}
                </span>
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    item.danger ? "text-rose-700" : "text-amber-700/70",
                  )}
                />
              </div>
              <p
                className={cn(
                  "mt-1 truncate font-mono text-sm font-extrabold sm:text-base",
                  item.danger ? "text-rose-900" : "text-stone-900",
                )}
              >
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
