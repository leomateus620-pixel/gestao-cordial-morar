import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  Eye,
  Link,
  MapPin,
  MousePointerClick,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { axisTick, chartSuccess, chartSystem, gridStroke } from "@/lib/chart-palette";
import { brl } from "@/lib/format";
import type { MarketingCampaign, MarketingDailyMetric } from "@/types/marketing";
import {
  formatMarketingDateRange,
  formatMarketingNumber,
  formatMarketingPercent,
} from "@/services/marketing";

type CampaignDetailsDrawerProps = {
  campaign: MarketingCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canViewFinancialInsights?: boolean;
};

export function CampaignDetailsDrawer({
  campaign,
  open,
  onOpenChange,
  canViewFinancialInsights = true,
}: CampaignDetailsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-full flex-col overflow-y-auto overscroll-contain border-white/60 bg-[rgba(251,248,244,0.96)] p-0 backdrop-blur-2xl sm:max-w-[46rem]"
      >
        {campaign && (
          <CampaignDetailsContent
            campaign={campaign}
            canViewFinancialInsights={canViewFinancialInsights}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CampaignDetailsContent({
  campaign,
  canViewFinancialInsights,
}: {
  campaign: MarketingCampaign;
  canViewFinancialInsights: boolean;
}) {
  const cpl = campaign.costPerLead > 0 ? brl(campaign.costPerLead) : "Sem leads";

  return (
    <div className="min-h-full p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
      <SheetHeader className="text-left">
        <div className="flex flex-wrap items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-foreground/55 ring-1 ring-white/70">
            {campaign.channel}
          </span>
        </div>
        <SheetTitle className="text-2xl font-black tracking-tight text-foreground">
          {campaign.name}
        </SheetTitle>
        <SheetDescription className="max-w-2xl text-sm leading-relaxed text-foreground/58">
          {campaign.objective} · {formatMarketingDateRange(campaign.startDate, campaign.endDate)}
        </SheetDescription>
      </SheetHeader>

      <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DetailMetric
          icon={TrendingUp}
          label="Leads"
          value={formatMarketingNumber(campaign.leads)}
        />
        {canViewFinancialInsights && (
          <DetailMetric icon={Wallet} label="Investimento" value={brl(campaign.investment)} />
        )}
        <DetailMetric
          icon={MousePointerClick}
          label="Cliques"
          value={formatMarketingNumber(campaign.clicks)}
        />
        <DetailMetric
          icon={BarChart3}
          label="Acessos"
          value={formatMarketingNumber(campaign.accesses)}
        />
        <DetailMetric
          icon={Eye}
          label="Visualizações"
          value={formatMarketingNumber(campaign.views)}
        />
        <DetailMetric
          icon={Target}
          label="Conversão"
          value={formatMarketingPercent(campaign.conversionRate)}
        />
        {canViewFinancialInsights && <DetailMetric icon={Wallet} label="CPL" value={cpl} />}
        <DetailMetric icon={MapPin} label="Melhor região" value={campaign.bestLocation} />
      </section>


      <section className="mt-5 rounded-3xl border border-white/65 bg-white/55 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-foreground">Análise da campanha</h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground/58">{campaign.diagnosis}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <InfoBlock icon={UserRound} label="Responsável" value={campaign.responsiblePerson} />
          <InfoBlock
            icon={CalendarDays}
            label="Período"
            value={formatMarketingDateRange(campaign.startDate, campaign.endDate)}
          />
          <InfoBlock icon={MapPin} label="Entrega principal" value={campaign.bestLocation} />
          <InfoBlock
            icon={Target}
            label="Meta prevista"
            value={
              campaign.expectedLeads
                ? `${campaign.expectedLeads} leads esperados`
                : "Meta não informada"
            }
          />
        </div>
        <p className="mt-4 rounded-2xl bg-white/62 px-3 py-2 text-sm leading-relaxed text-foreground/60">
          {campaign.notes}
        </p>
        {campaign.referenceUrl && (
          <a
            href={campaign.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Link className="size-3.5" />
            Abrir referência
          </a>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-white/65 bg-white/55 p-4 shadow-sm">
        <h3 className="text-base font-black text-foreground">Performance ao longo do tempo</h3>
        <p className="mt-1 text-xs leading-relaxed text-foreground/52">
          Leads e acessos por dia de campanha.
        </p>
        <div className="mt-4 h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={campaign.dailyMetrics}
              margin={{ top: 12, right: 8, left: -12, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`campaign-${campaign.id}-leads`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartSuccess} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={chartSuccess} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 8" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ ...axisTick, fontWeight: 700 }}
                tickFormatter={(value) => shortDateLabel(String(value))}
                minTickGap={14}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={34}
                allowDecimals={false}
              />
              <Tooltip content={<DetailsTooltip />} />
              <Area
                type="monotone"
                dataKey="leads"
                name="Leads"
                stroke={chartSuccess}
                strokeWidth={2.4}
                fill={`url(#campaign-${campaign.id}-leads)`}
                activeDot={{ r: 5, strokeWidth: 2.5, stroke: "rgba(255,255,255,0.95)" }}
              />
              <Area
                type="monotone"
                dataKey="accesses"
                name="Acessos"
                stroke={chartSystem}
                strokeWidth={1.8}
                fill="transparent"
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-white/65 bg-white/55 p-4 shadow-sm">
        <h3 className="text-base font-black text-foreground">Entrega por localização</h3>
        <div className="mt-3 space-y-2">
          {campaign.locationBreakdown.map((item) => {
            const max = Math.max(
              ...campaign.locationBreakdown.map((location) => location.impressions),
              1,
            );
            const width = Math.max(4, (item.impressions / max) * 100);

            return (
              <div key={item.location} className="rounded-2xl bg-white/58 p-3 ring-1 ring-white/62">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">{item.location}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-foreground/50">
                      {formatMarketingNumber(item.clicks)} cliques ·{" "}
                      {formatMarketingNumber(item.leads)} leads
                    </p>
                  </div>
                  <span className="font-mono text-sm font-black text-primary">
                    {formatMarketingNumber(item.impressions)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/65">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/65 bg-white/58 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/45">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/58 px-3 py-2 ring-1 ring-white/62">
      <p className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/45">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function DetailsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: MarketingDailyMetric }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-2xl border border-white/70 bg-white/96 p-3 text-xs shadow-[0_20px_50px_-20px_rgba(23,27,33,0.32)] backdrop-blur-xl">
      <p className="mb-2 text-sm font-black text-foreground">{shortDateLabel(item.date)}</p>
      <TooltipLine label="Leads" value={formatMarketingNumber(item.leads)} />
      <TooltipLine label="Acessos" value={formatMarketingNumber(item.accesses)} />
      <TooltipLine label="Cliques" value={formatMarketingNumber(item.clicks)} />
      <TooltipLine label="Visualizações" value={formatMarketingNumber(item.views)} />
    </div>
  );
}

function TooltipLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-44 items-center justify-between gap-4">
      <span className="text-foreground/58">{label}</span>
      <span className="font-mono font-black text-foreground">{value}</span>
    </div>
  );
}

function shortDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
