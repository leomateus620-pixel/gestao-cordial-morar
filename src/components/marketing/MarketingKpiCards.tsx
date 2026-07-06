import {
  Activity,
  BarChart3,
  Eye,
  Megaphone,
  MousePointerClick,
  Percent,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketingSummary } from "@/services/marketing";
import {
  formatMarketingCompact,
  formatMarketingNumber,
  formatMarketingPercent,
} from "@/services/marketing";

type MarketingKpiCardsProps = {
  summary: MarketingSummary;
};

type KpiTone = "primary" | "success" | "warning" | "danger" | "neutral";

export function MarketingKpiCards({ summary }: MarketingKpiCardsProps) {
  const cards: Array<{
    label: string;
    value: string;
    helper: string;
    icon: LucideIcon;
    tone: KpiTone;
  }> = [
    {
      label: "Leads gerados",
      value: formatMarketingNumber(summary.totalLeads),
      helper: summary.bestCampaign ? `melhor: ${summary.bestCampaign.name}` : "sem campanha líder",
      icon: TrendingUp,
      tone: "success",
    },
    {
      label: "Investimento total",
      value: brl(summary.totalInvestment, { compact: true }),
      helper: "mídia e ações registradas",
      icon: Wallet,
      tone: "primary",
    },
    {
      label: "Custo por lead",
      value: summary.costPerLead > 0 ? brl(summary.costPerLead) : "Sem leads",
      helper: "média das campanhas com leads",
      icon: Activity,
      tone: summary.attentionCampaigns > 0 ? "warning" : "neutral",
    },
    {
      label: "Cliques",
      value: formatMarketingCompact(summary.clicks),
      helper: "interações medidas",
      icon: MousePointerClick,
      tone: "primary",
    },
    {
      label: "Acessos",
      value: formatMarketingCompact(summary.accesses),
      helper: "visitas de campanha",
      icon: BarChart3,
      tone: "neutral",
    },
    {
      label: "Visualizações",
      value: formatMarketingCompact(summary.views),
      helper: summary.bestLocation
        ? `maior entrega: ${summary.bestLocation.location}`
        : "sem entrega",
      icon: Eye,
      tone: "neutral",
    },
    {
      label: "Conversão média",
      value: formatMarketingPercent(summary.conversionRate),
      helper: "leads sobre acessos",
      icon: Percent,
      tone: summary.conversionRate >= 7 ? "success" : "warning",
    },
    {
      label: "Campanhas ativas",
      value: formatMarketingNumber(summary.activeCampaigns),
      helper: `${summary.plannedCampaigns} planejada${summary.plannedCampaigns === 1 ? "" : "s"}`,
      icon: Megaphone,
      tone: summary.attentionCampaigns > 0 ? "danger" : "success",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <MarketingKpiCard key={card.label} {...card} />
      ))}
    </section>
  );
}

function MarketingKpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: KpiTone;
}) {
  const toneClass = {
    primary: {
      icon: "bg-primary/10 text-primary",
      value: "text-primary",
      line: "bg-primary",
    },
    success: {
      icon: "bg-emerald-500/10 text-emerald-700",
      value: "text-emerald-700",
      line: "bg-emerald-500",
    },
    warning: {
      icon: "bg-amber-500/12 text-amber-800",
      value: "text-amber-800",
      line: "bg-amber-500",
    },
    danger: {
      icon: "bg-red-500/10 text-red-700",
      value: "text-red-700",
      line: "bg-red-500",
    },
    neutral: {
      icon: "bg-slate-500/10 text-slate-600",
      value: "text-foreground",
      line: "bg-slate-400",
    },
  }[tone];

  return (
    <GlassCard
      variant="interactive"
      padding="none"
      className="group relative min-h-[8.25rem] overflow-hidden rounded-3xl p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-950/8 motion-reduce:transition-none sm:p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold leading-tight text-foreground/48 sm:text-[11px]">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 break-words text-[1.35rem] font-black leading-none tracking-tight sm:text-2xl",
              toneClass.value,
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={cn("grid size-8 shrink-0 place-items-center rounded-2xl", toneClass.icon)}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-foreground/55 sm:text-xs">
        {helper}
      </p>
      <span
        className={cn(
          "absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-75 rounded-full opacity-55 transition group-hover:scale-x-100 motion-reduce:transition-none",
          toneClass.line,
        )}
      />
    </GlassCard>
  );
}
