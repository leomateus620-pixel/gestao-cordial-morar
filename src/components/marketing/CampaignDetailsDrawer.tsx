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
import { CampaignHierarchyInsights } from "@/components/marketing/CampaignHierarchyInsights";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { axisTick, chartSystem, gridStroke } from "@/lib/chart-palette";
import { campaignStats, type DateRange } from "@/services/marketing-insights";
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
  onRestoreFocus?: () => void;
  canViewFinancialInsights?: boolean;
  metricsRange?: DateRange;
};
export function CampaignDetailsDrawer({
  campaign,
  open,
  onOpenChange,
  onRestoreFocus,
  canViewFinancialInsights = true,
  metricsRange,
}: CampaignDetailsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel="Fechar"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
        side="right"
        className="flex h-full w-full max-w-full flex-col overflow-y-auto overscroll-contain border-border bg-background p-0 sm:max-w-[46rem]"
      >
        {campaign && (
          <CampaignDetailsContent
            campaign={campaign}
            canViewFinancialInsights={canViewFinancialInsights}
            metricsRange={metricsRange}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
type DetailChartPoint = Omit<Partial<MarketingDailyMetric>, "leads" | "clicks"> & {
  date: string;
  leads: number | null;
  clicks: number | null;
};
function campaignChartRows(metrics: MarketingDailyMetric[], range?: DateRange): DetailChartPoint[] {
  const ordered = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length) return [];
  const since = range?.since ?? ordered[0].date,
    until = range?.until ?? ordered.at(-1)!.date;
  const start = Date.parse(`${since}T12:00:00Z`),
    days = Math.round((Date.parse(`${until}T12:00:00Z`) - start) / 86400000) + 1;
  const byDate = new Map(ordered.map((metric) => [metric.date, metric]));
  return Array.from({ length: Math.min(367, Math.max(0, days)) }, (_, index) => {
    const date = new Date(start + index * 86400000).toISOString().slice(0, 10);
    return byDate.get(date) ?? { date, leads: null, clicks: null };
  });
}
function CampaignDetailsContent({
  campaign,
  canViewFinancialInsights,
  metricsRange,
}: {
  campaign: MarketingCampaign;
  canViewFinancialInsights: boolean;
  metricsRange?: DateRange;
}) {
  const stat = metricsRange
    ? campaignStats(campaign, metricsRange.since.slice(0, 7), metricsRange)
    : null;
  if (stat)
    campaign = {
      ...campaign,
      investment: stat.spend,
      costPerLead: stat.cpl,
      leads: stat.leads,
      clicks: stat.clicks,
      impressions: stat.impressions,
      dailyMetrics: campaign.dailyMetrics.filter(
        (day) => day.date >= metricsRange!.since && day.date <= metricsRange!.until,
      ),
    };
  const hasData = stat?.hasData !== false;
  const currency = campaign.currency ?? (campaign.platform ? null : "BRL");
  const money = (value: number | null) =>
    value === null || currency === null
      ? "—"
      : value.toLocaleString("pt-BR", { style: "currency", currency });
  const pageViews =
    campaign.dailyMetrics.length > 0 &&
    campaign.dailyMetrics.every((day) => day.landingPageViews !== undefined)
      ? campaign.dailyMetrics.reduce((sum, day) => sum + day.landingPageViews!, 0)
      : null;
  const denominator = campaign.platform ? pageViews : campaign.accesses || null;
  const conversion =
    hasData && denominator && denominator > 0
      ? formatMarketingPercent((campaign.leads / denominator) * 100)
      : "—";
  const trend = campaignChartRows(campaign.dailyMetrics, metricsRange);
  return (
    <div className="min-h-full min-w-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
      <SheetHeader className="pr-8 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          <span className="text-xs font-medium text-foreground/70">
            {campaign.channel} · <span className="capitalize">{campaign.imobiliaria}</span>
          </span>
        </div>
        <SheetTitle className="break-words text-xl font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-2xl">
          {campaign.name}
        </SheetTitle>
        <SheetDescription className="text-sm text-foreground/70">
          {campaign.objective}
          {metricsRange
            ? ` · ${formatMarketingDateRange(metricsRange.since, metricsRange.until)}`
            : ""}
        </SheetDescription>
      </SheetHeader>
      {campaign.syncStatus === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          Falha na última sincronização. Consulte os detalhes da campanha.
        </p>
      )}
      {campaign.syncStatus === "partial" && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Dados parciais na última sincronização.
        </p>
      )}
      {["queued", "syncing"].includes(campaign.syncStatus ?? "") && (
        <p role="status" className="mt-4 text-xs text-primary">
          {campaign.syncStatus === "queued"
            ? "Sincronização na fila."
            : "Sincronização em andamento."}
        </p>
      )}
      <section
        aria-label="Resultados da campanha no período"
        className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <DetailMetric
          icon={TrendingUp}
          label="Leads reportados"
          value={hasData ? formatMarketingNumber(campaign.leads) : "—"}
        />
        {canViewFinancialInsights ? (
          <>
            <DetailMetric icon={Wallet} label="Investimento" value={money(campaign.investment)} />
            <DetailMetric icon={Target} label="CPL" value={money(campaign.costPerLead)} />
          </>
        ) : (
          <>
            <DetailMetric
              icon={Eye}
              label="Impressões"
              value={hasData ? formatMarketingNumber(campaign.impressions) : "—"}
            />
            <DetailMetric
              icon={BarChart3}
              label="Visualizações de destino"
              value={pageViews === null ? "—" : formatMarketingNumber(pageViews)}
            />
          </>
        )}
        <DetailMetric
          icon={MousePointerClick}
          label="Cliques"
          value={hasData ? formatMarketingNumber(campaign.clicks) : "—"}
        />
      </section>
      <section
        className="mt-4 min-w-0 rounded-xl border bg-card p-4"
        aria-label="Evolução dos leads da campanha"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Evolução dos leads reportados</h3>
          <span className="text-xs text-foreground/65">Contagem diária</span>
        </div>
        {trend.length ? (
          <div className="mt-4 h-52 min-w-0 sm:h-56">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 300, height: 208 }}
            >
              <AreaChart
                accessibilityLayer
                data={trend}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              >
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ ...axisTick, fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => shortDateLabel(String(value))}
                  minTickGap={28}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ ...axisTick, fontSize: 12, fill: "var(--muted-foreground)" }}
                  width={34}
                  allowDecimals={false}
                />
                <Tooltip content={<DetailsTooltip />} />
                <Area
                  isAnimationActive={false}
                  type="linear"
                  dataKey="leads"
                  name="Leads reportados"
                  stroke={chartSystem}
                  strokeWidth={2}
                  fill={chartSystem}
                  fillOpacity={0.09}
                  connectNulls={false}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-foreground/65">
            Sem métricas diárias neste período.
          </p>
        )}
      </section>
      {campaign.platform === "meta" && metricsRange && (
        <CampaignHierarchyInsights campaignId={campaign.id} range={metricsRange} />
      )}
      <details className="mt-4 rounded-xl border bg-card p-4">
        <summary className="inline-flex min-h-9 cursor-pointer items-center rounded text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Mais indicadores e detalhes da campanha
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {canViewFinancialInsights && (
            <>
              <DetailMetric
                icon={Eye}
                label="Impressões"
                value={hasData ? formatMarketingNumber(campaign.impressions) : "—"}
              />
              <DetailMetric
                icon={BarChart3}
                label="Visualizações de destino"
                value={pageViews === null ? "—" : formatMarketingNumber(pageViews)}
              />
            </>
          )}
          <DetailMetric
            icon={Target}
            label={campaign.platform ? "Leads / visualizações destino" : "Leads / acessos"}
            value={conversion}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-foreground/70">
          Leads reportados, submissões recebidas e atendimentos únicos são contagens diferentes. Um
          traço indica dado ou base de cálculo indisponível.
        </p>
        {campaign.diagnosis && (
          <p className="mt-4 text-sm leading-relaxed text-foreground/80">{campaign.diagnosis}</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <InfoBlock
            icon={CalendarDays}
            label="Última sincronização"
            value={
              campaign.lastSyncedAt
                ? new Date(campaign.lastSyncedAt).toLocaleString("pt-BR")
                : "Ainda não sincronizada"
            }
          />
          {campaign.syncError && (
            <InfoBlock icon={CalendarDays} label="Detalhe da falha" value={campaign.syncError} />
          )}
          <InfoBlock
            icon={Target}
            label="Conta / campanha externa"
            value={
              campaign.externalAccountId
                ? `${campaign.externalAccountId} / ${campaign.externalCampaignId || "—"}`
                : "Cadastro manual"
            }
          />
          <InfoBlock
            icon={UserRound}
            label="Responsável"
            value={campaign.responsiblePerson || "Não informado"}
          />
          <InfoBlock
            icon={CalendarDays}
            label="Período cadastrado"
            value={formatMarketingDateRange(campaign.startDate, campaign.endDate)}
          />
          <InfoBlock
            icon={MapPin}
            label="Localização cadastrada"
            value={campaign.bestLocation || "Não informada"}
          />
          <InfoBlock
            icon={Target}
            label="Meta prevista"
            value={
              campaign.expectedLeads
                ? `${campaign.expectedLeads} leads esperados`
                : "Meta não informada"
            }
          />
          <InfoBlock
            icon={Wallet}
            label="Moeda / fuso da conta"
            value={`${currency ?? "Moeda não informada"} · ${campaign.accountTimezone ?? "Fuso não informado"}`}
          />
        </div>
        {campaign.notes && (
          <p className="mt-4 rounded-lg bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground/75">
            {campaign.notes}
          </p>
        )}
        {campaign.referenceUrl && (
          <a
            href={campaign.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Link className="size-3.5" />
            Abrir referência
          </a>
        )}
        {campaign.locationBreakdown.length > 0 && (
          <section className="mt-4 border-t pt-4">
            <h3 className="text-sm font-semibold">Localizações da campanha</h3>
            <div className="mt-3 space-y-2">
              {campaign.locationBreakdown.map((item) => (
                <div
                  key={item.location}
                  className="flex items-start justify-between gap-3 rounded-lg bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{item.location}</p>
                    <p className="mt-1 text-xs text-foreground/70">
                      {formatMarketingNumber(item.clicks)} cliques ·{" "}
                      {formatMarketingNumber(item.leads)} leads
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    {formatMarketingNumber(item.impressions)}
                    <span className="mt-1 block text-foreground/65">impressões</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </details>
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
    <div className="min-w-0 rounded-lg border border-border/70 bg-card p-3">
      <p className="flex items-start gap-1.5 text-xs text-foreground/70">
        <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold tabular-nums text-foreground">{value}</p>
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
    <div className="min-w-0 rounded-lg bg-muted/20 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-foreground/70">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-foreground [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
function DetailsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DetailChartPoint }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="mb-2 font-semibold">
        {new Date(`${item.date}T12:00:00Z`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })}
      </p>
      <TooltipLine
        label="Leads reportados"
        value={item.leads === null ? "Sem dado" : formatMarketingNumber(item.leads)}
      />
      <TooltipLine
        label="Cliques"
        value={item.clicks === null ? "Sem dado" : formatMarketingNumber(item.clicks)}
      />
    </div>
  );
}
function TooltipLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-44 items-center justify-between gap-4">
      <span className="text-foreground/70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
function shortDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "Sem data"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}
