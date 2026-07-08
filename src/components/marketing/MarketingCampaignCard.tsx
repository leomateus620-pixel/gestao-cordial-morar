import {
  BarChart3,
  CalendarDays,
  Eye,
  Facebook,
  Home,
  Instagram,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Search,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketingCampaign, MarketingChannel } from "@/types/marketing";
import {
  formatMarketingDateRange,
  formatMarketingNumber,
  formatMarketingPercent,
  getCampaignStrength,
} from "@/services/marketing";

type MarketingCampaignCardProps = {
  campaign: MarketingCampaign;
  onOpenDetails: (campaign: MarketingCampaign) => void;
  canViewFinancialInsights?: boolean;
};

export function MarketingCampaignCard({
  campaign,
  onOpenDetails,
  canViewFinancialInsights = true,
}: MarketingCampaignCardProps) {
  const ChannelIcon = getChannelIcon(campaign.channel);
  const strength = getCampaignStrength(campaign);
  const cpl = campaign.costPerLead > 0 ? brl(campaign.costPerLead) : "Sem leads";

  return (
    <article className="group relative min-w-0 overflow-hidden rounded-[1.45rem] border border-white/68 bg-white/58 p-4 shadow-[0_16px_42px_-30px_rgba(23,27,33,0.3)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/68 hover:shadow-xl hover:shadow-slate-950/8 motion-reduce:transition-none sm:p-5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
      />

      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <ChannelIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 text-base font-black leading-tight tracking-tight text-foreground">
                {campaign.name}
              </h3>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-foreground/54">
              {campaign.channel} · {campaign.objective}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
        <div className="grid grid-cols-2 gap-2">
          <CardMetric
            icon={TrendingUp}
            label="Leads"
            value={formatMarketingNumber(campaign.leads)}
          />
          {canViewFinancialInsights && (
            <CardMetric icon={Wallet} label="Investimento" value={brl(campaign.investment)} />
          )}
          <CardMetric
            icon={MousePointerClick}
            label="Cliques"
            value={formatMarketingNumber(campaign.clicks)}
          />
          <CardMetric
            icon={BarChart3}
            label="Acessos"
            value={formatMarketingNumber(campaign.accesses)}
          />
        </div>

        <MiniLeadChart campaign={campaign} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
        <InfoPill icon={Eye} label="Visualizações" value={formatMarketingNumber(campaign.views)} />
        <InfoPill
          icon={TrendingUp}
          label="Conversão"
          value={formatMarketingPercent(campaign.conversionRate)}
        />
        {canViewFinancialInsights && <InfoPill icon={Wallet} label="CPL" value={cpl} />}
        <InfoPill icon={MapPin} label="Melhor região" value={campaign.bestLocation} />
      </div>


      <div className="mt-4 flex flex-col gap-3 border-t border-white/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-foreground/52">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatMarketingDateRange(campaign.startDate, campaign.endDate)}
            </span>
            <span className={cn("inline-flex items-center gap-1", getStrengthColor(strength))}>
              <Megaphone className="size-3.5" />
              {strength}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/56">
            {campaign.diagnosis}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetails(campaign)}
          aria-label={`Abrir análise da campanha ${campaign.name}`}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-bold text-white shadow-[0_14px_28px_-18px_rgba(30,100,125,0.9)] transition hover:bg-primary/90 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none sm:w-auto"
        >
          Análise
        </button>
      </div>
    </article>
  );
}

function CardMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/55 p-3 ring-1 ring-white/60">
      <p className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/45">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/42 px-3 py-2 ring-1 ring-white/55">
      <p className="flex items-center gap-1 truncate font-semibold text-foreground/45">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 line-clamp-2 font-bold leading-tight text-foreground">{value}</p>
    </div>
  );
}

function MiniLeadChart({ campaign }: { campaign: MarketingCampaign }) {
  const max = Math.max(...campaign.dailyMetrics.map((item) => item.leads), 1);

  return (
    <div className="rounded-2xl bg-white/46 p-3 ring-1 ring-white/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-foreground/48">Leads por dia</p>
        <span className="font-mono text-[11px] font-black text-primary">
          {formatMarketingNumber(campaign.leads)}
        </span>
      </div>
      <div
        className="mt-3 flex h-16 items-end gap-1.5 sm:h-20"
        aria-label="Mini gráfico de leads diários"
      >
        {campaign.dailyMetrics.slice(-7).map((metric) => (
          <span
            key={metric.date}
            title={`${metric.leads} leads em ${metric.date}`}
            className="min-w-0 flex-1 rounded-t-lg bg-primary/72 shadow-[0_6px_14px_-10px_rgba(30,100,125,0.7)]"
            style={{ height: `${Math.max(8, (metric.leads / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function getChannelIcon(channel: MarketingChannel): LucideIcon {
  if (channel === "Instagram") return Instagram;
  if (channel === "Facebook") return Facebook;
  if (channel === "Google") return Search;
  if (channel === "WhatsApp") return MessageCircle;
  if (channel === "E-mail") return Mail;
  if (channel === "Open house") return Home;
  return Megaphone;
}

function getStrengthColor(strength: string) {
  if (strength.includes("forte") || strength.includes("Boa")) return "text-emerald-700";
  if (strength.includes("atenção") || strength.includes("Revisar")) return "text-amber-800";
  if (strength.includes("Pausada")) return "text-slate-600";
  return "text-primary";
}
