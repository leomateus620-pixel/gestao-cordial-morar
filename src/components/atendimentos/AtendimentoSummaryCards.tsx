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
                  "flex min-w-40 shrink-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:min-w-0",
                  active ? cn(ui.accent, "ring-1 ring-inset ring-current/10") : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => onStageChange(stage)}
                  className={cn(
                    "flex flex-1 flex-col items-start px-3 pt-3 pb-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                    active && "bg-muted/50",
                  )}
                  aria-pressed={active}
                  aria-label={`Selecionar ${label}, ${quantityLabel}`}
                >
                  <span className="flex w-full items-start gap-1.5 text-xs font-semibold leading-4 text-foreground">
                    <span
                      className={cn("mt-1 size-2 shrink-0 rounded-full", ui.dot)}
                      aria-hidden="true"
                    />
                    <span className="min-h-8 flex-1 break-words">{label}</span>
                    {active && (
                      <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {count}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onExpandStage(stage)}
                  aria-label={`Expandir ${label}, ${quantityLabel}`}
                  className="flex min-h-10 items-center gap-1.5 px-3 pb-2 text-left text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <Maximize2 className="size-3.5 shrink-0" aria-hidden="true" />
                  Expandir etapa
                </button>
              </div>
            );
          })}
        </div>
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
      )}
    </section>
  );
}
