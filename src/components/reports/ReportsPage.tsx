import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  Building2,
  Headphones,
  Home,
  KeyRound,
  LineChart,
  Megaphone,
  Percent,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AgencySwitcher } from "@/components/agency-switcher";
import { GlassCard } from "@/components/shared/glass-card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { axisTick, gridStroke } from "@/lib/chart-palette";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buildReportsOverview,
  getDefaultReportsCustomRange,
  type ReportsDataInput,
} from "@/services/reports";
import type {
  ReportsAreaId,
  ReportsAreaSummary,
  ReportsChartConfig,
  ReportsChartPoint,
  ReportsChartSeries,
  ReportsComparisonMode,
  ReportsInsightItem,
  ReportsKpi,
  ReportsOverview,
  ReportsPeriodPreset,
  ReportsRankingGroup,
  ReportsRankingItem,
  ReportsSourceState,
  ReportsTone,
  ReportsValueKind,
} from "@/types/reports";

type ReportsPageProps = Omit<
  ReportsDataInput,
  "periodPreset" | "comparisonMode" | "customStart" | "customEnd" | "today"
>;

type TooltipPayload = Array<{
  dataKey?: string | number;
  value?: string | number;
  color?: string;
  payload?: ReportsChartPoint;
}>;

const periodOptions: Array<{
  value: ReportsPeriodPreset;
  label: string;
  shortLabel: string;
}> = [
  { value: "today", label: "Hoje", shortLabel: "Hoje" },
  { value: "this_week", label: "Esta semana", shortLabel: "Semana" },
  { value: "last_7_days", label: "Últimos 7 dias", shortLabel: "7 dias" },
  { value: "this_month", label: "Este mês", shortLabel: "Mês" },
  { value: "last_30_days", label: "Últimos 30 dias", shortLabel: "30 dias" },
  { value: "custom", label: "Período personalizado", shortLabel: "Personalizado" },
];

const comparisonOptions: Array<{ value: ReportsComparisonMode; label: string }> = [
  { value: "previous_period", label: "Comparar com período anterior" },
  { value: "previous_month", label: "Comparar com mês anterior" },
  { value: "previous_week", label: "Comparar com semana anterior" },
  { value: "none", label: "Sem comparação" },
];

export function ReportsPage(props: ReportsPageProps) {
  const {
    agency,
    agenciamentos,
    atendimentos,
    campaigns,
    clients,
    corretores,
    lancamentos,
    rentals,
    sales,
    sourceStates,
  } = props;
  const defaultCustomRange = useMemo(() => getDefaultReportsCustomRange(), []);
  const [periodPreset, setPeriodPreset] = useState<ReportsPeriodPreset>("this_month");
  const [comparisonMode, setComparisonMode] = useState<ReportsComparisonMode>("previous_period");
  const [customStart, setCustomStart] = useState(defaultCustomRange.start);
  const [customEnd, setCustomEnd] = useState(defaultCustomRange.end);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setIsRefreshing(true);
    const timeout = window.setTimeout(() => setIsRefreshing(false), 180);
    return () => window.clearTimeout(timeout);
  }, [agency, comparisonMode, customEnd, customStart, periodPreset]);

  const overview = useMemo(
    () =>
      buildReportsOverview({
        agency,
        agenciamentos,
        atendimentos,
        campaigns,
        clients,
        corretores,
        lancamentos,
        rentals,
        sales,
        sourceStates,
        periodPreset,
        comparisonMode,
        customStart,
        customEnd,
      }),
    [
      agency,
      agenciamentos,
      atendimentos,
      campaigns,
      clients,
      comparisonMode,
      corretores,
      customEnd,
      customStart,
      lancamentos,
      periodPreset,
      rentals,
      sales,
      sourceStates,
    ],
  );

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-6 pb-5">
      <ReportsHeader
        overview={overview}
        periodPreset={periodPreset}
        comparisonMode={comparisonMode}
        customStart={customStart}
        customEnd={customEnd}
        isRefreshing={isRefreshing}
        onPeriodChange={setPeriodPreset}
        onComparisonChange={setComparisonMode}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />

      <div
        className={cn(
          "space-y-6 transition-opacity duration-200 motion-reduce:transition-none",
          isRefreshing && "opacity-75",
        )}
        aria-busy={isRefreshing}
      >
        <ReportsOverviewKpis kpis={overview.kpis} />

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <ReportsInsightPanel insights={overview.insights} />
          <ReportsComparisonGrid charts={overview.crossAreaComparisons} />
        </section>

        <ReportsAreas areas={overview.areas} />
        <ReportsRankingBoard groups={overview.rankings} />
      </div>
    </div>
  );
}

function ReportsHeader({
  overview,
  periodPreset,
  comparisonMode,
  customStart,
  customEnd,
  isRefreshing,
  onPeriodChange,
  onComparisonChange,
  onCustomStartChange,
  onCustomEndChange,
}: {
  overview: ReportsOverview;
  periodPreset: ReportsPeriodPreset;
  comparisonMode: ReportsComparisonMode;
  customStart: string;
  customEnd: string;
  isRefreshing: boolean;
  onPeriodChange: (value: ReportsPeriodPreset) => void;
  onComparisonChange: (value: ReportsComparisonMode) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}) {
  return (
    <section className="premium-card overflow-hidden p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white/45 px-3 py-1 text-[10px] font-bold text-primary shadow-sm">
            <Sparkles className="size-3.5" />
            Inteligência operacional
          </div>
          <h1 className="text-2xl font-black leading-tight text-foreground sm:text-3xl">
            Relatórios
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/62 sm:text-base">
            Compare períodos, acompanhe indicadores e visualize insights da imobiliária.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <HeaderPill label="Período" value={overview.period.label} />
            <HeaderPill label="Comparação" value={overview.comparison.label} />
            {isRefreshing && <HeaderPill label="Status" value="Atualizando" active />}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 xl:w-[min(46rem,48vw)]">
          <ReportsPeriodFilters value={periodPreset} onChange={onPeriodChange} />

          {periodPreset === "custom" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <DateField label="Início" value={customStart} onChange={onCustomStartChange} />
              <DateField label="Fim" value={customEnd} onChange={onCustomEndChange} />
            </div>
          )}

          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="min-w-0">
              <ControlLabel>Escopo</ControlLabel>
              <AgencySwitcher />
            </div>
            <label className="min-w-0">
              <ControlLabel>Comparação por período</ControlLabel>
              <select
                value={comparisonMode}
                onChange={(event) =>
                  onComparisonChange(event.target.value as ReportsComparisonMode)
                }
                className="min-h-11 w-full min-w-0 rounded-2xl border border-white/65 bg-white/62 px-3 text-sm font-bold text-foreground shadow-sm outline-none transition focus:border-primary/35 focus:ring-2 focus:ring-primary/15"
              >
                {comparisonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportsPeriodFilters({
  value,
  onChange,
}: {
  value: ReportsPeriodPreset;
  onChange: (value: ReportsPeriodPreset) => void;
}) {
  return (
    <div className="min-w-0">
      <ControlLabel>Selecione um período</ControlLabel>
      <div className="glass-panel flex min-w-0 gap-1 overflow-x-auto rounded-[1.35rem] p-1">
        {periodOptions.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-10 shrink-0 rounded-full px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none lg:flex-1",
                active
                  ? "bg-primary text-white shadow-[0_12px_26px_-18px_rgba(30,100,125,0.9)]"
                  : "text-foreground/58 hover:bg-white/62 hover:text-foreground",
              )}
            >
              <span className="hidden sm:inline">{option.label}</span>
              <span className="sm:hidden">{option.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportsOverviewKpis({ kpis }: { kpis: ReportsKpi[] }) {
  return (
    <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <ReportKpiCard key={kpi.id} kpi={kpi} />
      ))}
    </section>
  );
}

function ReportKpiCard({ kpi }: { kpi: ReportsKpi }) {
  const Icon = getKpiIcon(kpi.id);
  const toneClass = getToneClass(kpi.tone ?? "neutral");

  return (
    <GlassCard
      variant="interactive"
      padding="none"
      className="group relative overflow-hidden rounded-3xl border border-white/62 bg-white/48 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-950/8 motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-foreground/48">{kpi.label}</p>
          <div className="mt-2 flex min-w-0 items-end gap-2">
            <p className="truncate text-2xl font-black leading-none text-foreground sm:text-3xl">
              {kpi.formattedValue}
            </p>
            {kpi.delta && <DeltaPill delta={kpi.delta} />}
          </div>
        </div>
        <span
          className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", toneClass.icon)}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 min-h-8 text-xs leading-relaxed text-foreground/58">{kpi.helper}</p>
      <span
        className={cn(
          "absolute inset-x-4 bottom-0 h-0.5 origin-left rounded-full opacity-60 transition group-hover:scale-x-100",
          toneClass.bar,
        )}
      />
    </GlassCard>
  );
}

function ReportsInsightPanel({ insights }: { insights: ReportsInsightItem[] }) {
  return (
    <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
      <SectionTitle
        icon={<Sparkles className="size-5" />}
        title="Insights"
        subtitle="Sinais calculados a partir dos dados disponíveis."
      />
      {insights.length ? (
        <div className="mt-4 space-y-2.5">
          {insights.slice(0, 6).map((insight) => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
        </div>
      ) : (
        <ReportsEmptyState
          title="Sem dados suficientes para gerar insights."
          description="Quando houver volume nos módulos analisados, os sinais aparecerão aqui."
          icon={<Sparkles className="size-5" />}
          compact
        />
      )}
    </GlassCard>
  );
}

function ReportsComparisonGrid({ charts }: { charts: ReportsChartConfig[] }) {
  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-3">
      {charts.map((chart) => (
        <ReportsChartPanel key={chart.id} chart={chart} compact />
      ))}
    </section>
  );
}

function ReportsAreas({ areas }: { areas: ReportsAreaSummary[] }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">Áreas analisadas</h2>
          <p className="text-sm leading-relaxed text-foreground/58">
            Cada módulo aparece com gráfico, indicadores de apoio, ranking e leitura contextual.
          </p>
        </div>
        <span className="w-fit rounded-full bg-white/55 px-3 py-1 text-[11px] font-bold text-foreground/54">
          {areas.length} frentes de análise
        </span>
      </div>

      {areas.map((area) => (
        <ReportsAreaSection key={area.id} area={area} />
      ))}
    </section>
  );
}

function ReportsAreaSection({ area }: { area: ReportsAreaSummary }) {
  const Icon = getAreaIcon(area.id);

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-col gap-3 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-white/55 text-primary shadow-sm ring-1 ring-white/70">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-foreground">{area.title}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-foreground/58">
              {area.subtitle}
            </p>
          </div>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 rounded-3xl border border-white/60 bg-white/45 p-2 sm:w-auto sm:min-w-[22rem]">
          <MetricMini
            label={area.metricLabel}
            value={area.metricValue}
            detail={area.metricDetail}
          />
          <div className="rounded-2xl bg-white/56 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-foreground/42">Comparativo</p>
            {area.delta ? (
              <div className="mt-1 flex items-center gap-2">
                <DeltaPill delta={area.delta} />
                <span className="truncate text-xs font-semibold text-foreground/52">
                  {area.delta.direction === "flat" ? "sem variação" : "vs. referência"}
                </span>
              </div>
            ) : (
              <p className="mt-1 truncate text-sm font-black text-foreground/58">Sem comparação</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(18rem,0.58fr)]">
        <ReportsChartPanel chart={area.chart} state={area.state} />
        <ReportsAreaSidePanel area={area} />
      </div>
    </section>
  );
}

function ReportsAreaSidePanel({ area }: { area: ReportsAreaSummary }) {
  return (
    <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {area.highlights.map((item) => (
          <HighlightItem key={item.id} item={item} />
        ))}
      </div>

      <div className="mt-5">
        <RankingList
          title={area.rankings.title}
          items={area.rankings.items}
          emptyTitle={area.rankings.emptyTitle}
        />
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-[10px] font-bold uppercase text-foreground/42">Leitura rápida</p>
        {area.insights.length ? (
          area.insights
            .slice(0, 2)
            .map((insight) => <InsightRow key={insight.id} insight={insight} compact />)
        ) : (
          <p className="rounded-2xl bg-white/45 px-3 py-2 text-xs leading-relaxed text-foreground/52">
            Sem dados suficientes para interpretação neste recorte.
          </p>
        )}
      </div>
    </GlassCard>
  );
}

function ReportsRankingBoard({ groups }: { groups: ReportsRankingGroup[] }) {
  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<BarChart3 className="size-5" />}
        title="Rankings"
        subtitle="Listas compactas para localizar concentração, responsáveis e canais com destaque."
      />
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <GlassCard key={group.id} className="rounded-3xl p-4" padding="none">
            <div className="mb-3">
              <h3 className="text-sm font-black text-foreground">{group.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/52">{group.subtitle}</p>
            </div>
            <RankingList items={group.items} emptyTitle={group.emptyTitle} />
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

function ReportsChartPanel({
  chart,
  state,
  compact = false,
}: {
  chart: ReportsChartConfig;
  state?: ReportsSourceState;
  compact?: boolean;
}) {
  const status = state?.status ?? (chartHasData(chart) ? "ready" : "empty");
  const height = compact ? "h-64" : "h-72 sm:h-80";

  return (
    <GlassCard className="min-w-0 rounded-3xl p-4 sm:p-5" padding="none">
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-foreground sm:text-base">{chart.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/52">{chart.subtitle}</p>
        </div>
        <LineChart className="mt-1 size-4 shrink-0 text-primary/55" />
      </div>

      {status === "loading" ? (
        <div className={cn("grid place-items-center", height)}>
          <LoadingSkeleton rows={3} className="w-full" />
        </div>
      ) : status === "error" ? (
        <ReportsEmptyState
          title={state?.title ?? "Erro ao carregar relatórios."}
          description={state?.description ?? "Tente novamente em instantes."}
          icon={<AlertTriangle className="size-5" />}
          tone="danger"
          className={height}
        />
      ) : status === "unavailable" ? (
        <ReportsEmptyState
          title={state?.title ?? "Dados indisponíveis para este perfil."}
          description={state?.description ?? "A origem desta área não está disponível no momento."}
          icon={<RefreshCw className="size-5" />}
          tone="warning"
          className={height}
        />
      ) : !chartHasData(chart) ? (
        <ReportsEmptyState
          title={state?.title ?? chart.emptyTitle}
          description={state?.description ?? chart.emptyDescription}
          icon={<BarChart3 className="size-5" />}
          className={height}
        />
      ) : (
        <div className={cn("min-w-0", height)}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(chart)}
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function renderChart(chart: ReportsChartConfig) {
  const margin = { top: 12, right: 10, left: 0, bottom: 0 };
  const valueKind = chart.series[0]?.valueKind ?? "number";
  const common = {
    data: chart.data,
    margin,
  };
  const axes = (
    <>
      <CartesianGrid stroke={gridStroke} vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} tick={axisTick} />
      <YAxis
        width={46}
        tickLine={false}
        axisLine={false}
        tick={axisTick}
        tickFormatter={(value) => formatAxisValue(Number(value), valueKind)}
      />
      <Tooltip
        content={<ReportsTooltip series={chart.series} />}
        cursor={{ stroke: "rgba(30,100,125,0.16)", strokeWidth: 1.4, strokeDasharray: "5 5" }}
        wrapperStyle={{ outline: "none", zIndex: 20 }}
      />
    </>
  );

  if (chart.kind === "bar") {
    return (
      <BarChart {...common}>
        {axes}
        {chart.series.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            fill={series.color}
            radius={[8, 8, 3, 3]}
            maxBarSize={42}
            animationDuration={620}
          />
        ))}
      </BarChart>
    );
  }

  if (chart.kind === "line") {
    return (
      <RechartsLineChart {...common}>
        {axes}
        {chart.series.map((series) => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.8}
            dot={{ r: 2.5, fill: series.color, stroke: "rgba(255,255,255,0.95)", strokeWidth: 1.5 }}
            activeDot={{
              r: 6,
              fill: series.color,
              stroke: "rgba(255,255,255,0.95)",
              strokeWidth: 2.5,
            }}
            animationDuration={720}
          />
        ))}
      </RechartsLineChart>
    );
  }

  if (chart.kind === "area") {
    return (
      <AreaChart {...common}>
        <defs>
          {chart.series.map((series) => (
            <linearGradient
              key={series.key}
              id={`${chart.id}-${series.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={series.color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={series.color} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>
        {axes}
        {chart.series.map((series) => (
          <Area
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.6}
            fill={`url(#${chart.id}-${series.key})`}
            activeDot={{
              r: 6,
              fill: series.color,
              stroke: "rgba(255,255,255,0.95)",
              strokeWidth: 2.5,
            }}
            animationDuration={720}
          />
        ))}
      </AreaChart>
    );
  }

  return (
    <ComposedChart {...common}>
      {axes}
      {chart.series.map((series) =>
        series.chartType === "line" ? (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.8}
            dot={{ r: 2.4, fill: series.color, stroke: "rgba(255,255,255,0.95)", strokeWidth: 1.5 }}
            activeDot={{
              r: 6,
              fill: series.color,
              stroke: "rgba(255,255,255,0.95)",
              strokeWidth: 2.5,
            }}
            animationDuration={720}
          />
        ) : (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            fill={series.color}
            radius={[8, 8, 3, 3]}
            maxBarSize={38}
            animationDuration={620}
          />
        ),
      )}
    </ComposedChart>
  );
}

function ReportsTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: string;
  series: ReportsChartSeries[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload)?.payload;
  if (!point) return null;

  return (
    <div className="min-w-[13rem] rounded-2xl border border-white/70 bg-white/96 p-3 text-xs shadow-[0_22px_52px_-20px_rgba(23,27,33,0.28)] backdrop-blur-xl">
      <p className="text-[10px] font-black uppercase text-primary/64">{point.tooltipLabel}</p>
      <div className="mt-2 space-y-1.5">
        {series.map((item) => {
          const found = payload.find((entry) => String(entry.dataKey) === item.key);
          const value = Number(found?.value ?? point[item.key] ?? 0);
          return (
            <div key={item.key} className="flex items-center justify-between gap-5">
              <span className="flex min-w-0 items-center gap-2 text-foreground/60">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <span className="font-mono text-sm font-black text-foreground">
                {formatValue(value, item.valueKind)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingList({
  title,
  items,
  emptyTitle,
}: {
  title?: string;
  items: ReportsRankingItem[];
  emptyTitle: string;
}) {
  return (
    <div className="min-w-0">
      {title && <p className="mb-2 text-[10px] font-bold uppercase text-foreground/42">{title}</p>}
      {items.length ? (
        <div className="space-y-2">
          {items.slice(0, 5).map((item, index) => (
            <RankingRow key={item.id} item={item} index={index} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-white/45 px-3 py-3 text-xs leading-relaxed text-foreground/52">
          {emptyTitle}
        </p>
      )}
    </div>
  );
}

function RankingRow({ item, index }: { item: ReportsRankingItem; index: number }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/46 px-3 py-2 transition hover:bg-white/62">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[11px] font-black text-primary">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
          {item.subtitle && (
            <p className="truncate text-[11px] text-foreground/50">{item.subtitle}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-xs font-black text-foreground">{item.value}</p>
          {item.secondaryValue && (
            <p className="text-[10px] font-semibold text-foreground/44">{item.secondaryValue}</p>
          )}
        </div>
      </div>
      {typeof item.progress === "number" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/65">
          <div
            className="h-full rounded-full bg-primary/75"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function HighlightItem({ item }: { item: { label: string; value: string; tone?: ReportsTone } }) {
  const tone = getToneClass(item.tone ?? "neutral");
  return (
    <div className="rounded-2xl bg-white/48 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase text-foreground/42">{item.label}</p>
      <p className={cn("mt-1 truncate text-lg font-black leading-none", tone.text)}>{item.value}</p>
    </div>
  );
}

function InsightRow({
  insight,
  compact = false,
}: {
  insight: ReportsInsightItem;
  compact?: boolean;
}) {
  const tone = getToneClass(insight.tone);
  const Icon =
    insight.direction === "down"
      ? TrendingDown
      : insight.direction === "up"
        ? TrendingUp
        : Sparkles;

  return (
    <div className={cn("flex min-w-0 gap-3 rounded-2xl bg-white/48 p-3", compact && "p-2.5")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", tone.icon)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black leading-snug text-foreground">{insight.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/56">{insight.description}</p>
      </div>
    </div>
  );
}

function ReportsEmptyState({
  title,
  description,
  icon,
  tone = "neutral",
  compact = false,
  className,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  tone?: ReportsTone;
  compact?: boolean;
  className?: string;
}) {
  const toneClass = getToneClass(tone);
  return (
    <div
      className={cn(
        "grid min-h-48 place-items-center rounded-3xl border border-dashed border-foreground/10 bg-white/32 p-5 text-center",
        compact && "min-h-40",
        className,
      )}
    >
      <div className="max-w-[24rem]">
        <span className={cn("mx-auto grid size-11 place-items-center rounded-2xl", toneClass.icon)}>
          {icon}
        </span>
        <p className="mt-3 text-sm font-black text-foreground">{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/54">{description}</p>
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/55 text-primary shadow-sm ring-1 ring-white/70">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-black text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground/56">{subtitle}</p>
      </div>
    </div>
  );
}

function MetricMini({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/56 px-3 py-2">
      <p className="truncate text-[10px] font-bold uppercase text-foreground/42">{label}</p>
      <p className="mt-1 truncate text-base font-black text-foreground sm:text-lg">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-foreground/50">{detail}</p>
    </div>
  );
}

function HeaderPill({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/48 px-3 text-[11px] font-bold text-foreground/58 ring-1 ring-white/62",
        active && "bg-primary/10 text-primary ring-primary/12",
      )}
    >
      <span className="text-foreground/42">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 rounded-2xl border border-white/65 bg-white/58 px-3 py-2 shadow-sm">
      <span className="block text-[10px] font-bold uppercase text-foreground/42">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-7 w-full min-w-0 bg-transparent text-sm font-black text-foreground outline-none"
      />
    </label>
  );
}

function ControlLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] font-bold uppercase text-foreground/42">
      {children}
    </span>
  );
}

function DeltaPill({ delta }: { delta: NonNullable<ReportsKpi["delta"]> }) {
  const tone = getToneClass(delta.tone);
  const Icon =
    delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Percent;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black",
        tone.soft,
      )}
    >
      <Icon className="size-3" />
      {delta.label}
    </span>
  );
}

function getKpiIcon(id: string) {
  const icons: Record<string, typeof BarChart3> = {
    agenciamentos: Building2,
    atendimentos: Headphones,
    clientes: Users,
    alugueis: KeyRound,
    vendas: Home,
    receita: BadgeDollarSign,
    leads: Megaphone,
    conversao: Percent,
  };
  return icons[id] ?? BarChart3;
}

function getAreaIcon(area: ReportsAreaId) {
  const icons: Record<ReportsAreaId, typeof BarChart3> = {
    agenciamentos: Building2,
    atendimentos: Headphones,
    clientes: Users,
    alugueis: KeyRound,
    vendas: Home,
    financeiro: WalletCards,
    marketing: Megaphone,
  };
  return icons[area];
}

function getToneClass(tone: ReportsTone) {
  const classes: Record<ReportsTone, { icon: string; soft: string; text: string; bar: string }> = {
    neutral: {
      icon: "bg-slate-500/10 text-slate-700",
      soft: "bg-slate-500/10 text-slate-700",
      text: "text-foreground",
      bar: "bg-slate-400",
    },
    positive: {
      icon: "bg-emerald-500/10 text-[color:var(--success)]",
      soft: "bg-emerald-500/10 text-[color:var(--success)]",
      text: "text-[color:var(--success)]",
      bar: "bg-[color:var(--success)]",
    },
    attention: {
      icon: "bg-orange-500/12 text-orange-700",
      soft: "bg-orange-500/12 text-orange-700",
      text: "text-orange-700",
      bar: "bg-orange-500",
    },
    warning: {
      icon: "bg-amber-500/12 text-amber-700",
      soft: "bg-amber-500/12 text-amber-700",
      text: "text-amber-700",
      bar: "bg-amber-500",
    },
    danger: {
      icon: "bg-red-500/10 text-[color:var(--danger)]",
      soft: "bg-red-500/10 text-[color:var(--danger)]",
      text: "text-[color:var(--danger)]",
      bar: "bg-[color:var(--danger)]",
    },
    info: {
      icon: "bg-primary/10 text-primary",
      soft: "bg-primary/10 text-primary",
      text: "text-primary",
      bar: "bg-primary",
    },
  };
  return classes[tone];
}

function chartHasData(chart: ReportsChartConfig) {
  return chart.data.some((point) =>
    chart.series.some((series) => Math.abs(Number(point[series.key] ?? 0)) > 0),
  );
}

function formatAxisValue(value: number, kind: ReportsValueKind) {
  if (kind === "currency") return brl(value, { compact: true });
  if (kind === "percent") return `${Math.round(value)}%`;
  return new Intl.NumberFormat("pt-BR", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(value);
}

function formatValue(value: number, kind: ReportsValueKind) {
  if (kind === "currency") return brl(value, { compact: true });
  if (kind === "percent") return `${Math.round(value)}%`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}
