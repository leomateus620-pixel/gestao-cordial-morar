import type { AgenciamentoSummary } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

export type AgenciamentoSummaryKey =
  | "total"
  | "pendentes"
  | "fotos"
  | "placas"
  | "site"
  | "validados";

type AgenciamentoSummaryCardsProps = {
  summary: AgenciamentoSummary;
  variant: "admin" | "corretor";
  periodLabel: string;
  activeKey?: AgenciamentoSummaryKey | null;
  onSelect?: (key: AgenciamentoSummaryKey) => void;
};

type Metric = {
  key: AgenciamentoSummaryKey;
  label: string;
  value: number;
  hint: string;
  tone: "primary" | "warning" | "success";
};

export function AgenciamentoSummaryCards({
  summary,
  variant,
  periodLabel,
  activeKey,
  onSelect,
}: AgenciamentoSummaryCardsProps) {
  const pendingPhotos = Math.max(summary.total - summary.fotosCompletas, 0);
  const pendingSigns = Math.max(summary.total - summary.placasInstaladas, 0);
  const outsideSite = Math.max(summary.total - summary.cadastradosSite, 0);

  const metrics: Metric[] = [
    {
      key: "total",
      label: variant === "admin" ? "Agenciamentos" : "Meus agenciamentos",
      value: summary.total,
      hint: periodLabel,
      tone: "primary",
    },
    {
      key: "pendentes",
      label: "Pendentes de validação",
      value: summary.pendentesValidacao,
      hint: "aguardando conferência",
      tone: "warning",
    },
    {
      key: "fotos",
      label: "Fotos pendentes",
      value: pendingPhotos,
      hint: "sem horizontal ou vertical",
      tone: "warning",
    },
    {
      key: "placas",
      label: "Placas pendentes",
      value: pendingSigns,
      hint: "imóveis sem sinalização",
      tone: "warning",
    },
    {
      key: "site",
      label: "Fora do site",
      value: outsideSite,
      hint: "cadastro a concluir",
      tone: "warning",
    },
    {
      key: "validados",
      label: "Validados",
      value: summary.validados,
      hint: `${summary.percentualChecklistMedio}% de checklist médio`,
      tone: "success",
    },
  ];

  return (
    <section aria-label="Resumo operacional">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => {
          const isActive = activeKey === metric.key;
          const isPrimary = metric.tone === "primary";
          const isResolved = metric.tone === "warning" && metric.value === 0;
          return (
            <button
              key={metric.key}
              type="button"
              onClick={() => onSelect?.(metric.key)}
              aria-pressed={isActive}
              aria-label={`Filtrar por ${metric.label}`}
              className={cn(
                "group relative min-w-0 overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-foreground/16 active:translate-y-0 active:scale-[0.99]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isPrimary
                  ? "border-[#245f70] bg-[#174d61] text-white"
                  : "border-foreground/8 bg-white text-foreground",
                isResolved && !isActive && "opacity-60 hover:opacity-100",
                isActive &&
                  (isPrimary
                    ? "ring-2 ring-cyan-200/80 ring-offset-2 ring-offset-background"
                    : "border-primary/50 ring-2 ring-primary/40 ring-offset-2 ring-offset-background"),
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 top-0 h-full w-[3px] transition-opacity duration-200",
                  isPrimary && "bg-cyan-200/70",
                  metric.tone === "warning" &&
                    (metric.value > 0 ? "bg-[var(--system-accent)]" : "bg-foreground/15"),
                  metric.tone === "success" && "bg-emerald-500",
                  isActive ? "opacity-100" : "opacity-45 group-hover:opacity-90",
                )}
              />
              <p
                className={cn(
                  "truncate text-[11px] font-bold uppercase tracking-[0.06em]",
                  isPrimary ? "text-white/75" : "text-foreground/55",
                )}
                title={metric.label}
              >
                {metric.label}
              </p>
              <p className="mt-1.5 text-[1.65rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
                {metric.value}
              </p>
              <p
                className={cn(
                  "mt-2 truncate text-[11px] font-medium leading-tight",
                  isActive
                    ? isPrimary
                      ? "text-cyan-100"
                      : "text-primary"
                    : isPrimary
                      ? "text-white/55"
                      : "text-foreground/48",
                )}
              >
                {isActive ? "Filtro ativo · tocar para limpar" : metric.hint}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
