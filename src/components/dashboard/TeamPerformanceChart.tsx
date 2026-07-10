import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Award,
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  FileCheck2,
  HousePlus,
  Loader2,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { axisTick, chartCordial, chartMorar, chartSystem, gridStroke } from "@/lib/chart-palette";
import type { EquipePeriodo, EquipePerformanceResult } from "@/lib/equipe/equipe.functions";

type Props = {
  data: EquipePerformanceResult;
  periodo: EquipePeriodo;
  onPeriodoChange: (next: EquipePeriodo) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  className?: string;
};

const PERIODOS: Array<{ value: EquipePeriodo; label: string; helper: string }> = [
  { value: "mes", label: "Mês", helper: "Mês atual" },
  { value: "ultimos_30", label: "30 dias", helper: "Últimos 30 dias" },
  { value: "trimestre", label: "Trimestre", helper: "Últimos 3 meses" },
  { value: "ano", label: "Ano", helper: "Ano corrente" },
];

const METRIC_KEYS = ["atendimentos", "contratos", "agenciamentos"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
type VisibleMetrics = Record<MetricKey, boolean>;

const DEFAULT_VISIBLE_METRICS: VisibleMetrics = {
  atendimentos: true,
  contratos: true,
  agenciamentos: true,
};

const SERIES: Record<
  MetricKey,
  {
    color: string;
    softColor: string;
    gradId: string;
    label: string;
    tooltipLabel: string;
    Icon: LucideIcon;
  }
> = {
  atendimentos: {
    color: chartCordial,
    softColor: "rgba(43,127,163,0.12)",
    gradId: "perfGradAtend",
    label: "Atendimentos",
    tooltipLabel: "atendimentos",
    Icon: Users,
  },
  contratos: {
    color: chartMorar,
    softColor: "rgba(224,122,46,0.13)",
    gradId: "perfGradContr",
    label: "Contratos",
    tooltipLabel: "contratos",
    Icon: FileCheck2,
  },
  agenciamentos: {
    color: chartSystem,
    softColor: "rgba(30,100,125,0.12)",
    gradId: "perfGradAg",
    label: "Agenciamentos",
    tooltipLabel: "agenciamentos",
    Icon: HousePlus,
  },
};

type ChartRow = {
  nome: string;
  nomeCompleto: string;
  atendimentos: number;
  contratos: number;
  agenciamentos: number;
  conversao: number;
  total: number;
};

type TooltipPayload = {
  payload?: ChartRow;
};

export function TeamPerformanceChart({
  data,
  periodo,
  onPeriodoChange,
  isLoading,
  isFetching,
  isError,
  className,
}: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visibleMetrics, setVisibleMetrics] = useState<VisibleMetrics>(DEFAULT_VISIBLE_METRICS);

  const chartData = useMemo<ChartRow[]>(
    () =>
      data.rows.map((r) => ({
        nome: r.primeiroNome,
        nomeCompleto: r.nome,
        atendimentos: r.atendimentos,
        contratos: r.contratos,
        agenciamentos: r.agenciamentos,
        conversao: r.conversao,
        total: r.atendimentos + r.contratos + r.agenciamentos,
      })),
    [data.rows],
  );

  const visibleKeys = useMemo(
    () => METRIC_KEYS.filter((key) => visibleMetrics[key]),
    [visibleMetrics],
  );
  const hasData = chartData.length > 0;
  const selectedPeriod = PERIODOS.find((p) => p.value === periodo) ?? PERIODOS[0];
  const maxMetricTotal = Math.max(
    data.totals.atendimentos,
    data.totals.contratos,
    data.totals.agenciamentos,
    1,
  );

  const leader = useMemo(() => {
    if (!hasData) return null;
    return chartData.reduce<ChartRow | null>((best, row) => {
      const rowScore = getVisibleTotal(row, visibleKeys);
      const bestScore = best ? getVisibleTotal(best, visibleKeys) : -1;
      return rowScore > bestScore ? row : best;
    }, null);
  }, [chartData, hasData, visibleKeys]);

  const dominantMetric = leader ? getDominantMetric(leader, visibleKeys) : "atendimentos";
  const chartHeight = useMemo(() => {
    const rowCount = Math.max(chartData.length, 1);
    const rowHeight = visibleKeys.length === 1 ? 42 : 56;
    return Math.min(390, Math.max(250, rowCount * rowHeight + 74));
  }, [chartData.length, visibleKeys.length]);
  const barSize = visibleKeys.length === 1 ? 18 : 10;
  const shouldAnimate = !prefersReducedMotion;
  const showSkeleton = isLoading && !isError;
  const showFetchingBadge = isFetching && !showSkeleton && !isError;
  const allMetricsVisible = visibleKeys.length === METRIC_KEYS.length;

  const toggleMetric = (key: MetricKey) => {
    setVisibleMetrics((current) => {
      const next = { ...current, [key]: !current[key] };
      return METRIC_KEYS.some((metric) => next[metric]) ? next : DEFAULT_VISIBLE_METRICS;
    });
  };

  const showAllMetrics = () => setVisibleMetrics(DEFAULT_VISIBLE_METRICS);

  return (
    <section
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-[1.65rem] p-3 sm:p-4 lg:p-5",
        className,
      )}
      style={{
        background:
          "linear-gradient(148deg, rgba(255,255,255,0.9) 0%, rgba(250,252,253,0.78) 46%, rgba(255,248,241,0.86) 100%)",
        backdropFilter: "blur(22px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.72)",
        boxShadow:
          "0 24px 58px -28px rgba(23,27,33,0.28), 0 12px 22px -20px rgba(30,100,125,0.2), inset 0 1px 0 rgba(255,255,255,0.94)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      <header className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-white/58 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-foreground/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Sparkles className="size-3" aria-hidden />
            Performance da equipe
          </div>
          <h3 className="mt-2 text-[1.05rem] font-black leading-tight tracking-normal text-foreground sm:text-xl">
            Atendimentos, contratos e agenciamentos
          </h3>
          <p className="mt-1 max-w-[34rem] text-[12px] leading-relaxed text-foreground/58">
            Compare volume comercial, conversão e captação por corretor no período selecionado.
          </p>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-1.5 lg:items-end">
          <div
            className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-foreground/10 bg-white/56 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]"
            role="radiogroup"
            aria-label="Selecionar período da performance"
          >
            {PERIODOS.map((p) => {
              const active = p.value === periodo;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onPeriodoChange(p.value)}
                  className={cn(
                    "relative shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-extrabold tracking-normal transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,100,125,0.32)]",
                    active
                      ? "bg-foreground text-white shadow-[0_10px_20px_-14px_rgba(23,27,33,0.85)]"
                      : "text-foreground/58 hover:bg-white/74 hover:text-foreground",
                  )}
                  title={p.helper}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-foreground/45">
            {showFetchingBadge ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {showFetchingBadge ? "Atualizando dados reais" : selectedPeriod.helper}
          </span>
        </div>
      </header>

      <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
        <MetricSummaryTile
          metric="atendimentos"
          value={data.totals.atendimentos}
          context={`${selectedPeriod.label} selecionado`}
          share={(data.totals.atendimentos / maxMetricTotal) * 100}
          active={visibleMetrics.atendimentos}
          onToggle={() => toggleMetric("atendimentos")}
        />
        <MetricSummaryTile
          metric="contratos"
          value={data.totals.contratos}
          context={`${data.totals.conversaoMedia}% de conversão média`}
          share={(data.totals.contratos / maxMetricTotal) * 100}
          active={visibleMetrics.contratos}
          onToggle={() => toggleMetric("contratos")}
        />
        <MetricSummaryTile
          metric="agenciamentos"
          value={data.totals.agenciamentos}
          context="Captação no período"
          share={(data.totals.agenciamentos / maxMetricTotal) * 100}
          active={visibleMetrics.agenciamentos}
          onToggle={() => toggleMetric("agenciamentos")}
        />
      </div>

      <div className="relative z-10 mt-4 overflow-hidden rounded-[1.35rem] border border-white/68 bg-white/46 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:p-3">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/42">
              Comparativo por corretor
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-foreground/58">
              {leader ? (
                <>
                  <span className="font-extrabold text-foreground">{leader.nomeCompleto}</span>{" "}
                  lidera em {SERIES[dominantMetric].tooltipLabel} no período selecionado.
                </>
              ) : (
                "Ranking será exibido assim que houver movimento comercial."
              )}
            </p>
          </div>

          {leader ? (
            <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-foreground/10 bg-white/64 px-2.5 py-1.5 text-[11px] font-bold text-foreground/72">
              <Award className="size-3.5" style={{ color: SERIES[dominantMetric].color }} />
              Top do período
              <span className="rounded-full bg-foreground/6 px-2 py-0.5 font-mono text-[10px]">
                {getVisibleTotal(leader, visibleKeys)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="relative w-full min-w-0" style={{ height: chartHeight }}>
          {showSkeleton ? (
            <SkeletonChart />
          ) : isError ? (
            <ErrorChart periodoLabel={selectedPeriod.label} />
          ) : hasData ? (
            <>
              {showFetchingBadge ? (
                <div className="pointer-events-none absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/82 px-2 py-1 text-[10px] font-bold text-foreground/62 shadow-sm backdrop-blur">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Recarregando
                </div>
              ) : null}
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 2, right: 34, top: 12, bottom: 2 }}
                  barCategoryGap={visibleKeys.length === 1 ? "38%" : "24%"}
                  barGap={4}
                >
                  <defs>
                    {METRIC_KEYS.map((key) => {
                      const serie = SERIES[key];
                      return (
                        <linearGradient
                          key={serie.gradId}
                          id={serie.gradId}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="0"
                        >
                          <stop offset="0%" stopColor={serie.color} stopOpacity={0.95} />
                          <stop offset="58%" stopColor={serie.color} stopOpacity={0.82} />
                          <stop offset="100%" stopColor={serie.color} stopOpacity={0.5} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid stroke={gridStroke} strokeDasharray="4 8" horizontal={false} />
                  <XAxis
                    type="number"
                    orientation="top"
                    allowDecimals={false}
                    tickCount={4}
                    tickLine={false}
                    axisLine={false}
                    tick={{ ...axisTick, fontWeight: 700, fill: "rgba(42,48,56,0.48)" }}
                  />
                  <YAxis
                    dataKey="nome"
                    type="category"
                    width={76}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                    tick={{ ...axisTick, fontWeight: 800, fill: "rgba(42,48,56,0.82)" }}
                    tickFormatter={(value) => truncateLabel(String(value), 12)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(30,100,125,0.055)" }}
                    wrapperStyle={{ outline: "none", zIndex: 50 }}
                    content={
                      <RichTooltip periodoLabel={selectedPeriod.label} visibleKeys={visibleKeys} />
                    }
                  />
                  {visibleKeys.map((key) => {
                    const serie = SERIES[key];
                    return (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={serie.label}
                        fill={`url(#${serie.gradId})`}
                        radius={[0, 999, 999, 0]}
                        minPointSize={4}
                        barSize={barSize}
                        isAnimationActive={shouldAnimate}
                        animationDuration={420}
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={`${key}-${entry.nomeCompleto}`}
                            fill={`url(#${serie.gradId})`}
                            fillOpacity={leader?.nomeCompleto === entry.nomeCompleto ? 1 : 0.72}
                          />
                        ))}
                        <LabelList
                          dataKey={key}
                          position="right"
                          formatter={formatBarValue}
                          style={{ fill: serie.color, fontSize: 10, fontWeight: 900 }}
                        />
                      </Bar>
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      <footer className="relative z-10 mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Séries do gráfico"
        >
          <button
            type="button"
            onClick={showAllMetrics}
            aria-pressed={allMetricsVisible}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,100,125,0.32)]",
              allMetricsVisible
                ? "border-foreground/15 bg-foreground text-white"
                : "border-foreground/10 bg-white/48 text-foreground/58 hover:bg-white/78 hover:text-foreground",
            )}
          >
            Todos
          </button>
          {METRIC_KEYS.map((key) => {
            const serie = SERIES[key];
            const active = visibleMetrics[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleMetric(key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,100,125,0.32)]",
                  active
                    ? "border-white/70 bg-white/68 text-foreground shadow-sm"
                    : "border-foreground/8 bg-white/30 text-foreground/42",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: serie.color }} />
                {serie.label}
                {active ? (
                  <Eye className="size-3 text-foreground/42" aria-hidden />
                ) : (
                  <EyeOff className="size-3 text-foreground/32" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        <span className="inline-flex items-center gap-1 self-start font-mono text-[10px] font-semibold text-foreground/40 lg:self-auto">
          {selectedPeriod.label}
          <ChevronRight className="size-3" aria-hidden />
        </span>
      </footer>
    </section>
  );
}

function MetricSummaryTile({
  metric,
  value,
  context,
  share,
  active,
  onToggle,
}: {
  metric: MetricKey;
  value: number;
  context: string;
  share: number;
  active: boolean;
  onToggle: () => void;
}) {
  const serie = SERIES[metric];
  const Icon = serie.Icon;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "group min-w-0 rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,100,125,0.32)]",
        active
          ? "border-white/76 bg-white/56 shadow-[0_14px_28px_-22px_rgba(23,27,33,0.35),inset_0_1px_0_rgba(255,255,255,0.88)]"
          : "border-foreground/8 bg-white/26 opacity-62",
      )}
      style={{
        background: active
          ? `linear-gradient(135deg, ${serie.softColor} 0%, rgba(255,255,255,0.58) 62%, rgba(255,255,255,0.34) 100%)`
          : undefined,
      }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-xl border border-white/70 bg-white/64 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
              style={{ color: serie.color }}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <p className="truncate text-[10px] font-black uppercase tracking-[0.11em] text-foreground/50">
              {serie.label}
            </p>
          </div>
          <p
            className="mt-2 font-mono text-2xl font-black leading-none tracking-normal"
            style={{ color: serie.color }}
          >
            {value}
          </p>
        </div>
        <span
          className={cn(
            "mt-1 size-2.5 rounded-full ring-4 transition",
            active ? "opacity-100" : "opacity-35",
          )}
          style={{ background: serie.color, boxShadow: `0 0 0 4px ${serie.softColor}` }}
          aria-hidden
        />
      </div>
      <p className="mt-2 truncate text-[10px] font-semibold text-foreground/48">{context}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/7">
        <span
          className="block h-full rounded-full transition-[width] duration-300"
          style={{
            width: share > 0 ? `${Math.max(8, Math.min(100, share))}%` : 0,
            background: serie.color,
          }}
        />
      </div>
    </button>
  );
}

function RichTooltip({
  active,
  payload,
  periodoLabel,
  visibleKeys,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  periodoLabel: string;
  visibleKeys: MetricKey[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const dominantMetric = getDominantMetric(point, METRIC_KEYS);
  const total = METRIC_KEYS.reduce((sum, key) => sum + point[key], 0);
  const insight =
    point.contratos === 0 && point.atendimentos > 0
      ? "Sem contratos no período"
      : point[dominantMetric] > 0
        ? `Maior volume em ${SERIES[dominantMetric].tooltipLabel}`
        : "Sem movimento no período";

  return (
    <div className="w-[17rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/72 bg-white/92 p-3 text-[11px] text-foreground shadow-[0_24px_54px_-28px_rgba(23,27,33,0.44)] backdrop-blur-xl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black leading-tight tracking-normal">
            {point.nomeCompleto}
          </p>
          <p className="mt-0.5 text-[10px] font-bold text-foreground/45">{periodoLabel}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/6 px-2 py-1 font-mono text-[10px] font-black text-foreground/70">
          <Target className="size-3" aria-hidden />
          {total}
        </span>
      </div>

      <div className="space-y-1.5">
        {METRIC_KEYS.map((key) => (
          <TooltipRow
            key={key}
            metric={key}
            value={point[key]}
            muted={!visibleKeys.includes(key)}
          />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-foreground/10 pt-2">
        <div className="rounded-xl bg-foreground/5 px-2 py-1.5">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-foreground/42">
            Conversão
          </p>
          <p className="mt-0.5 font-mono text-sm font-black text-foreground">
            {point.atendimentos > 0 ? `${point.conversao}%` : "N/A"}
          </p>
        </div>
        <div className="rounded-xl bg-foreground/5 px-2 py-1.5">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-foreground/42">
            Leitura
          </p>
          <p className="mt-0.5 truncate text-[10px] font-bold text-foreground/70">{insight}</p>
        </div>
      </div>
    </div>
  );
}

function TooltipRow({
  metric,
  value,
  muted,
}: {
  metric: MetricKey;
  value: number;
  muted: boolean;
}) {
  const serie = SERIES[metric];
  const Icon = serie.Icon;

  return (
    <div className={cn("flex items-center justify-between gap-3", muted && "opacity-48")}>
      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-foreground/62">
        <Icon className="size-3.5 shrink-0" style={{ color: serie.color }} aria-hidden />
        <span className="truncate">{serie.label}</span>
      </span>
      <span className="font-mono font-black text-foreground">{value}</span>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div
      className="flex h-full flex-col justify-center gap-4 px-2 sm:px-4"
      aria-label="Carregando performance da equipe"
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-32 animate-pulse rounded-full bg-foreground/10" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-foreground/8" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-3">
          <div className="h-3 animate-pulse rounded-full bg-foreground/10" />
          <div className="space-y-1.5">
            <div
              className="h-2.5 animate-pulse rounded-full bg-foreground/10"
              style={{ width: `${86 - i * 10}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded-full bg-foreground/8"
              style={{ width: `${62 - i * 8}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded-full bg-foreground/8"
              style={{ width: `${46 - i * 6}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-foreground/8 bg-white/58 text-foreground/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <BarChart3 className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-black tracking-normal text-foreground/72">
        Nenhum movimento comercial neste período.
      </p>
      <p className="max-w-[20rem] text-[12px] leading-relaxed text-foreground/50">
        Quando atendimentos, contratos ou agenciamentos forem registrados, a performance da equipe
        aparecerá aqui.
      </p>
    </div>
  );
}

function ErrorChart({ periodoLabel }: { periodoLabel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-red-200/70 bg-red-50/70 text-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <AlertCircle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-black tracking-normal text-foreground/72">
        Não foi possível carregar a performance.
      </p>
      <p className="max-w-[20rem] text-[12px] leading-relaxed text-foreground/50">
        Os dados reais de {periodoLabel.toLowerCase()} não responderam agora. Tente trocar o período
        ou atualizar o dashboard.
      </p>
    </div>
  );
}

function getVisibleTotal(row: ChartRow, keys: readonly MetricKey[]) {
  return keys.reduce((sum, key) => sum + row[key], 0);
}

function getDominantMetric(row: ChartRow, keys: readonly MetricKey[]) {
  return keys.reduce<MetricKey>(
    (best, key) => (row[key] > row[best] ? key : best),
    keys[0] ?? "atendimentos",
  );
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatBarValue(value: unknown) {
  return typeof value === "number" && value > 0 ? String(value) : "";
}
