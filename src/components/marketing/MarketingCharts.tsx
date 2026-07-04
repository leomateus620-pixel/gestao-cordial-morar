import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapPinned, PieChart as PieChartIcon, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  axisTick,
  chartAccent,
  chartGraphite,
  chartMorar,
  chartSuccess,
  chartSystem,
  gridStroke,
} from "@/lib/chart-palette";
import { brl } from "@/lib/format";
import type { MarketingCampaign } from "@/types/marketing";
import {
  buildCampaignPerformanceData,
  buildChannelDistributionData,
  buildLeadTrendData,
  buildLocationDeliveryData,
  formatMarketingCompact,
  formatMarketingNumber,
  formatMarketingPercent,
  type CampaignPerformanceDatum,
  type ChannelDistributionDatum,
  type LeadTrendDatum,
} from "@/services/marketing";

type MarketingChartsProps = {
  campaigns: MarketingCampaign[];
};

export function MarketingCharts({ campaigns }: MarketingChartsProps) {
  const performanceData = useMemo(() => buildCampaignPerformanceData(campaigns), [campaigns]);
  const channelData = useMemo(() => buildChannelDistributionData(campaigns), [campaigns]);
  const trendData = useMemo(() => buildLeadTrendData(campaigns), [campaigns]);
  const locationData = useMemo(() => buildLocationDeliveryData(campaigns), [campaigns]);

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.85fr)]">
      <ChartCard
        title="Desempenho por campanha"
        subtitle="Leads, cliques e visualizações nas campanhas mais relevantes."
        icon={<TrendingUp className="size-5" />}
      >
        <div className="h-80 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={performanceData}
              margin={{ top: 12, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ ...axisTick, fontWeight: 700 }}
                minTickGap={12}
              />
              <YAxis
                yAxisId="volume"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={40}
                tickFormatter={(value) => formatMarketingCompact(Number(value))}
              />
              <YAxis
                yAxisId="views"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={44}
                tickFormatter={(value) => formatMarketingCompact(Number(value))}
              />
              <Tooltip
                content={<PerformanceTooltip />}
                cursor={{ fill: "rgba(30,100,125,0.04)" }}
              />
              <Bar
                yAxisId="volume"
                dataKey="leads"
                name="Leads"
                fill={chartSuccess}
                radius={[8, 8, 3, 3]}
              />
              <Bar
                yAxisId="volume"
                dataKey="clicks"
                name="Cliques"
                fill={chartSystem}
                radius={[8, 8, 3, 3]}
              />
              <Line
                yAxisId="views"
                dataKey="views"
                name="Visualizações"
                stroke={chartAccent}
                strokeWidth={3}
                dot={false}
                strokeLinecap="round"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Distribuição por canal"
        subtitle="Leads gerados por origem de campanha."
        icon={<PieChartIcon className="size-5" />}
      >
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-1">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  dataKey="leads"
                  nameKey="label"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={3}
                  stroke="rgba(255,255,255,0.78)"
                  strokeWidth={2}
                >
                  {channelData.map((item) => (
                    <Cell key={item.channel} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChannelTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {channelData.map((item) => (
              <ChannelRow key={item.channel} item={item} />
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard
        title="Tendência de leads"
        subtitle="Evolução diária de leads e acessos das campanhas filtradas."
        icon={<TrendingUp className="size-5" />}
      >
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="marketingLeadArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartSuccess} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={chartSuccess} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ ...axisTick, fontWeight: 700 }}
                minTickGap={16}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={34}
                allowDecimals={false}
              />
              <Tooltip content={<LeadTrendTooltip />} />
              <Area
                type="monotone"
                dataKey="leads"
                name="Leads"
                stroke={chartSuccess}
                strokeWidth={3}
                fill="url(#marketingLeadArea)"
                activeDot={{ r: 6, strokeWidth: 3, stroke: "rgba(255,255,255,0.95)" }}
              />
              <Line
                type="monotone"
                dataKey="accesses"
                name="Acessos"
                stroke={chartSystem}
                strokeWidth={2}
                dot={false}
                strokeDasharray="6 5"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Entrega por região"
        subtitle="Regiões com maior alcance e geração de leads."
        icon={<MapPinned className="size-5" />}
      >
        <div className="space-y-2">
          {locationData.slice(0, 7).map((item) => (
            <LocationRow key={item.location} item={item} />
          ))}
        </div>
      </ChartCard>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/54">{subtitle}</p>
        </div>
      </div>
      {children}
    </GlassCard>
  );
}

function ChannelRow({ item }: { item: ChannelDistributionDatum }) {
  return (
    <div className="rounded-2xl bg-white/45 px-3 py-2 ring-1 ring-white/58">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-bold text-foreground/76">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="truncate">{item.label}</span>
        </span>
        <span className="font-mono text-xs font-black text-foreground">
          {formatMarketingNumber(item.leads)}
        </span>
      </div>
      <p className="mt-1 text-[10px] font-semibold text-foreground/46">
        {formatMarketingCompact(item.clicks)} cliques ·{" "}
        {formatMarketingPercent(item.conversionRate)}
      </p>
    </div>
  );
}

function LocationRow({
  item,
}: {
  item: {
    location: string;
    impressions: number;
    clicks: number;
    leads: number;
    share: number;
  };
}) {
  return (
    <div className="rounded-2xl bg-white/45 p-3 ring-1 ring-white/58">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-foreground">{item.location}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-foreground/48">
            {formatMarketingCompact(item.impressions)} impressões ·{" "}
            {formatMarketingNumber(item.leads)} leads
          </p>
        </div>
        <span className="font-mono text-sm font-black text-primary">
          {formatMarketingPercent(item.share)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/65">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.max(item.share, 3)}%` }}
        />
      </div>
    </div>
  );
}

function PerformanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CampaignPerformanceDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <TooltipShell title={item.fullName}>
      <TooltipLine label="Leads" value={formatMarketingNumber(item.leads)} color={chartSuccess} />
      <TooltipLine label="Cliques" value={formatMarketingNumber(item.clicks)} color={chartSystem} />
      <TooltipLine
        label="Visualizações"
        value={formatMarketingNumber(item.views)}
        color={chartAccent}
      />
      <TooltipLine
        label="Conversão"
        value={formatMarketingPercent(item.conversionRate)}
        color={chartMorar}
      />
      <TooltipLine
        label="CPL"
        value={item.costPerLead > 0 ? brl(item.costPerLead) : "Sem leads"}
        color={chartGraphite}
      />
    </TooltipShell>
  );
}

function ChannelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChannelDistributionDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <TooltipShell title={item.label}>
      <TooltipLine label="Leads" value={formatMarketingNumber(item.leads)} color={item.color} />
      <TooltipLine label="Cliques" value={formatMarketingNumber(item.clicks)} color={chartSystem} />
      <TooltipLine label="Investimento" value={brl(item.investment)} color={chartAccent} />
    </TooltipShell>
  );
}

function LeadTrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: LeadTrendDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <TooltipShell title={item.label}>
      <TooltipLine label="Leads" value={formatMarketingNumber(item.leads)} color={chartSuccess} />
      <TooltipLine
        label="Acessos"
        value={formatMarketingNumber(item.accesses)}
        color={chartSystem}
      />
      <TooltipLine label="Cliques" value={formatMarketingNumber(item.clicks)} color={chartMorar} />
    </TooltipShell>
  );
}

function TooltipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-52 rounded-2xl border border-white/70 bg-white/96 p-3 text-xs shadow-[0_20px_50px_-20px_rgba(23,27,33,0.32)] backdrop-blur-xl">
      <p className="mb-2 text-sm font-black text-foreground">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function TooltipLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="inline-flex items-center gap-1.5 text-foreground/58">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-mono font-black text-foreground">{value}</span>
    </div>
  );
}
