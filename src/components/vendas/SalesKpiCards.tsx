import {
  AlertTriangle,
  CalendarDays,
  FileCheck2,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalesKpis } from "@/types/sale";

type MetricTone = "primary" | "success" | "warning" | "neutral" | "info";

const toneMap: Record<MetricTone, string> = {
  primary: "border-t-primary/45 text-primary",
  success: "border-t-emerald-500/45 text-emerald-700",
  warning: "border-t-amber-500/60 text-amber-700",
  neutral: "border-t-slate-400/35 text-slate-600",
  info: "border-t-cyan-600/40 text-cyan-700",
};

type Metric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  tone: MetricTone;
};

function KpiCard({
  metric,
  isLoading,
  isUnavailable,
}: {
  metric: Metric;
  isLoading: boolean;
  isUnavailable: boolean;
}) {
  const Icon = metric.icon;

  return (
    <div
      className={cn(
        "relative flex min-h-[7.35rem] min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-white/70 border-t-2 bg-white/[0.66] px-3.5 py-3.5 shadow-[0_15px_34px_-30px_rgba(23,27,33,0.46)] backdrop-blur-lg",
        toneMap[metric.tone],
      )}
    >
      <dt className="flex items-start justify-between gap-2">
        <span className="max-w-[9rem] text-[10.5px] font-extrabold uppercase leading-[1.35] tracking-[0.11em] text-foreground/58">
          {metric.label}
        </span>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      </dt>

      <dd className="mt-auto min-h-6 min-w-0 pt-3 text-[clamp(1.05rem,2.4vw,1.35rem)] font-black leading-none tracking-[-0.025em] text-foreground tabular-nums">
        {isLoading ? (
          <>
            <span
              className="block h-5 w-20 animate-pulse rounded-lg bg-foreground/10 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sr-only">Carregando indicador</span>
          </>
        ) : isUnavailable ? (
          <span aria-label="Indicador indisponível">—</span>
        ) : (
          metric.value
        )}
      </dd>
      <p className="mt-1.5 text-[11px] font-semibold leading-4 text-foreground/50">
        {isUnavailable ? "indisponível no momento" : metric.detail}
      </p>
    </div>
  );
}

export function SalesKpiCards({
  kpis,
  showAverageTicket = true,
  isLoading = false,
  isUnavailable = false,
}: {
  kpis?: SalesKpis;
  showAverageTicket?: boolean;
  isLoading?: boolean;
  isUnavailable?: boolean;
}) {
  const metrics: Metric[] = [
    {
      id: "total",
      icon: WalletCards,
      label: "Total vendido",
      value: brl(kpis?.totalSold ?? 0, { compact: true }),
      detail: "histórico ativo",
      tone: "primary",
    },
    {
      id: "registered",
      icon: ReceiptText,
      label: "Vendas registradas",
      value: String(kpis?.registeredSales ?? 0),
      detail: "registros salvos",
      tone: "neutral",
    },
    {
      id: "contracts",
      icon: FileCheck2,
      label: "Contratos anexados",
      value: String(kpis?.attachedContracts ?? 0),
      detail: "documentos localizados",
      tone: "info",
    },
    ...(showAverageTicket
      ? [
          {
            id: "average",
            icon: TrendingUp,
            label: "Ticket médio",
            value: brl(kpis?.averageTicket ?? 0, { compact: true }),
            detail: "sem canceladas",
            tone: "success" as const,
          },
        ]
      : []),
    {
      id: "month",
      icon: CalendarDays,
      label: "Vendas do mês",
      value: String(kpis?.monthSales ?? 0),
      detail: "mês corrente",
      tone: "primary",
    },
    {
      id: "pendencies",
      icon: AlertTriangle,
      label: "Pendência documental",
      value: String(kpis?.documentPendencies ?? 0),
      detail: "contrato ou revisão",
      tone: "warning",
    },
  ];

  return (
    <section aria-label="Indicadores de vendas realizadas" aria-busy={isLoading}>
      <dl
        className={cn(
          "grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3",
          metrics.length === 6 ? "xl:grid-cols-6" : "xl:grid-cols-5",
        )}
      >
        {metrics.map((metric) => (
          <KpiCard
            key={metric.id}
            metric={metric}
            isLoading={isLoading}
            isUnavailable={isUnavailable}
          />
        ))}
      </dl>
    </section>
  );
}
