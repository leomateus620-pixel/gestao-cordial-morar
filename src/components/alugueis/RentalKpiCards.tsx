import { brl } from "@/lib/format";
import type { RentalKpis } from "@/types/rental";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Home, Wallet } from "lucide-react";

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "primary" | "warning" | "danger" | "success" | "neutral";
}) {
  const tones = {
    primary: "from-primary/15 to-primary/5 text-primary",
    warning: "from-amber-200/30 to-amber-50/10 text-amber-700",
    danger: "from-rose-200/30 to-rose-50/10 text-rose-700",
    success: "from-emerald-200/30 to-emerald-50/10 text-emerald-700",
    neutral: "from-slate-200/40 to-slate-50/10 text-slate-700",
  } as const;
  return (
    <div className="liquid-panel relative overflow-hidden rounded-2xl p-3">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tones[tone]} opacity-70`}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/55">
            {label}
          </p>
          <p className="mt-1 truncate font-mono text-base font-bold">{value}</p>
        </div>
        <Icon className="size-4 shrink-0 text-foreground/60" />
      </div>
    </div>
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
