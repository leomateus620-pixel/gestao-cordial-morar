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

type KpiTone = "primary" | "success" | "warning" | "neutral" | "info";

const toneMap: Record<KpiTone, string> = {
  primary: "from-primary/16 to-primary/5 text-primary",
  success: "from-emerald-200/35 to-emerald-50/10 text-emerald-700",
  warning: "from-amber-200/38 to-amber-50/10 text-amber-700",
  neutral: "from-slate-200/45 to-white/10 text-slate-700",
  info: "from-cyan-200/32 to-cyan-50/10 text-cyan-700",
};

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  tone: KpiTone;
}) {
  return (
    <article className="liquid-panel relative min-w-[10.5rem] overflow-hidden rounded-2xl p-3 sm:min-w-0">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
          toneMap[tone],
        )}
        aria-hidden
      />
      <div className="relative flex min-h-[5.35rem] flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <p className="max-w-[7.5rem] text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/55">
            {label}
          </p>
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/55 text-current ring-1 ring-white/70">
            <Icon className="size-4" />
          </span>
        </div>
        <div>
          <p className="truncate font-mono text-lg font-black leading-tight tabular-nums text-foreground sm:text-xl">
            {value}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-foreground/55">{detail}</p>
        </div>
      </div>
    </article>
  );
}

export function SalesKpiCards({
  kpis,
  showAverageTicket = true,
}: {
  kpis: SalesKpis;
  showAverageTicket?: boolean;
}) {
  return (
    <section
      className="snap-carousel md:grid md:grid-cols-3 md:gap-2.5 lg:grid-cols-6"
      aria-label="Indicadores de vendas realizadas"
    >
      <KpiCard
        icon={WalletCards}
        label="Total vendido"
        value={brl(kpis.totalSold, { compact: true })}
        detail="histórico ativo"
        tone="primary"
      />
      <KpiCard
        icon={ReceiptText}
        label="Vendas registradas"
        value={String(kpis.registeredSales).padStart(2, "0")}
        detail="registros salvos"
        tone="neutral"
      />
      <KpiCard
        icon={FileCheck2}
        label="Contratos anexados"
        value={String(kpis.attachedContracts).padStart(2, "0")}
        detail="documentos localizados"
        tone="info"
      />
      {showAverageTicket && (
        <KpiCard
          icon={TrendingUp}
          label="Ticket médio"
          value={brl(kpis.averageTicket, { compact: true })}
          detail="sem canceladas"
          tone="success"
        />
      )}
      <KpiCard
        icon={CalendarDays}
        label="Vendas do mês"
        value={String(kpis.monthSales).padStart(2, "0")}
        detail="mês corrente"
        tone="primary"
      />
      <KpiCard
        icon={AlertTriangle}
        label="Pendência documental"
        value={String(kpis.documentPendencies).padStart(2, "0")}
        detail="contrato ou revisão"
        tone="warning"
      />
    </section>
  );
}

