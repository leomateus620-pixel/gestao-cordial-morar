import {
  AlertCircle,
  BadgeDollarSign,
  Check,
  Home,
  Maximize2,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import { formatCompactCurrency } from "@/services/atendimentos";
import {
  pipelineStageLabel,
  type AtendimentoStatus,
  type PipelineStage,
} from "@/types/atendimento";
import { WORKSPACE_PIPELINE_STAGES } from "@/lib/atendimentos/stage-workspace";
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
  onExpandStage,
  showInsights = true,
  canViewFinancialInsights = true,
}: {
  stats: AtendimentoStats;
  selectedStage: PipelineStage;
  onStageChange: (stage: PipelineStage) => void;
  onExpandStage: (stage: PipelineStage) => void;
  showInsights?: boolean;
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
    <section className="space-y-2.5" aria-label="Resumo do funil">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-7 lg:px-0">
        {WORKSPACE_PIPELINE_STAGES.map((stage) => {
          const ui = pipelineStageUi[stage];
          const active = selectedStage === stage;
          const count = stats.pipeline[stage] ?? 0;
          const label = pipelineStageLabel(stage);
          const quantityLabel = `${count} atendimento${count === 1 ? "" : "s"}`;
          return (
            <div
              key={stage}
              className={cn(
                "group relative flex min-w-36 shrink-0 overflow-hidden rounded-2xl border shadow-[0_6px_18px_-14px_rgba(23,27,33,0.45)] transition lg:min-w-0",
                ui.column,
                active && cn(ui.accent, "bg-white shadow-[0_14px_28px_-18px_rgba(23,27,33,0.55)] ring-2 ring-inset ring-current/5"),
              )}
            >
              <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", ui.dot)} />
              <button
                type="button"
                onClick={() => onStageChange(stage)}
                className="flex min-w-0 flex-1 flex-col items-start gap-1 py-2.5 pl-3.5 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-pressed={active}
                aria-label={`Selecionar ${label}, ${quantityLabel}`}
              >
                <span className="font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
                  {count}
                </span>
                <span className="flex w-full min-w-0 items-center gap-1 text-[11px] font-semibold text-foreground/70">
                  <span className="truncate">{label}</span>
                  {active && <Check className="size-3 shrink-0 text-primary" aria-hidden="true" />}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onExpandStage(stage)}
                aria-label={`Expandir ${label}, ${quantityLabel}`}
                title="Expandir etapa"
                className="m-1.5 grid size-7 shrink-0 place-items-center self-start rounded-full text-foreground/40 transition hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Maximize2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {showInsights && (
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
                  "flex min-w-36 shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2 sm:min-w-0",
                  item.danger
                    ? "border-rose-700/20 bg-rose-50/80"
                    : "border-white/80 bg-white/70 backdrop-blur-sm",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl",
                    item.danger ? "bg-rose-600/12 text-rose-700" : "bg-amber-500/12 text-amber-700",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate font-display text-base font-semibold leading-none tabular-nums",
                      item.danger ? "text-rose-900" : "text-stone-900",
                    )}
                  >
                    {item.value}
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                    {item.label}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
