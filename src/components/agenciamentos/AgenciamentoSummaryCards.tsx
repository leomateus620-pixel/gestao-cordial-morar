import {
  BadgeCheck,
  CameraOff,
  ClipboardClock,
  Globe2,
  HousePlus,
  Signpost,
  type LucideIcon,
} from "lucide-react";
import type { AgenciamentoSummary } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type AgenciamentoSummaryCardsProps = {
  summary: AgenciamentoSummary;
  variant: "admin" | "corretor";
  periodLabel: string;
};

type Metric = {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: "primary" | "warning" | "neutral" | "success";
};

export function AgenciamentoSummaryCards({
  summary,
  variant,
  periodLabel,
}: AgenciamentoSummaryCardsProps) {
  const pendingPhotos = Math.max(summary.total - summary.fotosDrive, 0);
  const pendingSigns = Math.max(summary.total - summary.placasInstaladas, 0);
  const outsideSite = Math.max(summary.total - summary.cadastradosSite, 0);

  const metrics: Metric[] = [
    {
      label: variant === "admin" ? "Agenciamentos no período" : "Meus agenciamentos",
      value: summary.total,
      detail: periodLabel,
      icon: HousePlus,
      tone: "primary",
    },
    {
      label: "Pendentes de validação",
      value: summary.pendentesValidacao,
      detail: "aguardando conferência",
      icon: ClipboardClock,
      tone: "warning",
    },
    {
      label: "Fotos pendentes",
      value: pendingPhotos,
      detail: "ainda sem envio ao Drive",
      icon: CameraOff,
      tone: pendingPhotos > 0 ? "warning" : "neutral",
    },
    {
      label: "Placas pendentes",
      value: pendingSigns,
      detail: "imóveis sem sinalização",
      icon: Signpost,
      tone: pendingSigns > 0 ? "warning" : "neutral",
    },
    {
      label: "Imóveis fora do site",
      value: outsideSite,
      detail: "publicação a concluir",
      icon: Globe2,
      tone: outsideSite > 0 ? "warning" : "neutral",
    },
    {
      label: "Agenciamentos validados",
      value: summary.validados,
      detail: `${summary.percentualChecklistMedio}% de checklist médio`,
      icon: BadgeCheck,
      tone: "success",
    },
  ];

  return (
    <section aria-labelledby="agenciamentos-summary-title">
      <div className="mb-1.5 flex items-center justify-between gap-3 px-0.5">
        <div>
          <h2 id="agenciamentos-summary-title" className="text-sm font-bold tracking-tight">
            Resumo operacional
          </h2>
          <p className="mt-0.5 text-xs text-foreground/58">
            Pendências calculadas a partir dos registros filtrados.
          </p>
        </div>
        <span className="hidden text-xs font-semibold text-foreground/52 sm:inline">
          {periodLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className={cn(
                "relative min-w-0 overflow-hidden rounded-[1.25rem] border px-3.5 py-3 shadow-[0_14px_36px_-30px_rgba(23,27,33,0.36)] sm:px-4",
                metric.tone === "primary"
                  ? "border-[#245f70] bg-[#174d61] text-white"
                  : "border-white/72 bg-white/68 text-foreground backdrop-blur-lg",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={cn(
                    "max-w-[9.5rem] text-xs font-semibold leading-snug",
                    metric.tone === "primary" ? "text-white/82" : "text-foreground/68",
                  )}
                >
                  {metric.label}
                </p>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-[1.15rem] shrink-0",
                    metric.tone === "primary" && "text-cyan-100",
                    metric.tone === "warning" && "text-[var(--system-accent-dark)]",
                    metric.tone === "neutral" && "text-primary/72",
                    metric.tone === "success" && "text-emerald-700",
                  )}
                  strokeWidth={2}
                />
              </div>
              <p className="mt-2.5 text-2xl font-extrabold leading-none tracking-[-0.035em] tabular-nums sm:text-[1.7rem]">
                {metric.value}
              </p>
              <p
                className={cn(
                  "mt-2 truncate text-[11px] leading-tight",
                  metric.tone === "primary" ? "text-white/58" : "text-foreground/52",
                )}
                title={metric.detail}
              >
                {metric.detail}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
