import { brl } from "@/lib/format";
import type { RentalKpis } from "@/types/rental";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Home,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "warning" | "danger" | "success" | "neutral";

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  featured = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: Tone;
  featured?: boolean;
}) {
  const iconTone: Record<Tone, string> = {
    primary: "text-cyan-100",
    warning: "text-amber-600",
    danger: "text-rose-600",
    success: "text-emerald-600",
    neutral: "text-primary/70",
  };

  return (
    <article
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-2xl border px-3.5 py-3 transition-all duration-200",
        "shadow-[0_14px_36px_-30px_rgba(23,27,33,0.36)] hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-28px_rgba(23,27,33,0.44)]",
        featured
          ? "border-[#245f70] bg-[#174d61] text-white"
          : "border-white/72 bg-white/68 text-foreground backdrop-blur-lg",
      )}
    >
      {featured && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-cyan-300/25 blur-2xl"
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.14em]",
            featured ? "text-white/75" : "text-foreground/60",
          )}
        >
          {label}
        </p>
        <Icon
          aria-hidden
          className={cn("size-[1.05rem] shrink-0", featured ? iconTone.primary : iconTone[tone])}
          strokeWidth={2}
        />
      </div>
      <p
        className={cn(
          "relative mt-2 truncate text-2xl font-extrabold leading-none tracking-[-0.035em] tabular-nums",
          featured ? "text-white" : "text-foreground",
        )}
      >
        {value}
      </p>
    </article>
  );
}

export function RentalKpiCards({
  kpis,
  canViewFinancialInsights = true,
}: {
  kpis?: RentalKpis;
  canViewFinancialInsights?: boolean;
}) {
  const k = kpis ?? {
    receitaMensalAtiva: 0,
    contratosAtivos: 0,
    contratosPendentes: 0,
    vencendoEm30: 0,
    atrasos: 0,
    imoveisDisponiveis: 0,
  };
  return (
    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
      {canViewFinancialInsights && (
        <Kpi
          icon={Wallet}
          label="Receita mensal"
          value={brl(k.receitaMensalAtiva, { compact: true })}
          tone="primary"
          featured
        />
      )}
      <Kpi icon={CheckCircle2} label="Ativos" value={String(k.contratosAtivos)} tone="success" />
      <Kpi icon={Clock} label="Pendentes" value={String(k.contratosPendentes)} tone="warning" />
      <Kpi
        icon={CalendarClock}
        label="Vencendo 30d"
        value={String(k.vencendoEm30)}
        tone="warning"
      />
      <Kpi icon={AlertTriangle} label="Atrasos" value={String(k.atrasos)} tone="danger" />
      <Kpi icon={Home} label="Disponíveis" value={String(k.imoveisDisponiveis)} tone="neutral" />
    </section>
  );
}
