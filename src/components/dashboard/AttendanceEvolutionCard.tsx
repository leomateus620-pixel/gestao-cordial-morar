import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarRange,
  LineChart as LineChartIcon,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ATTENDANCES_QUERY_KEY } from "@/hooks/useAttendances";
import { listAttendances } from "@/lib/attendances/attendances.functions";
import { useSession } from "@/lib/auth-mock";
import { chartCordial, chartMorar, chartSystem, gridStroke } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import type { Atendimento } from "@/types/atendimento";

type PeriodMode = "week" | "month" | "year" | "custom";
type SeriesKey = "cordial" | "morar" | "total";
type Granularity = "day" | "week" | "month";

type DateRange = {
  start: Date;
  end: Date;
};

type AttendanceChartPoint = {
  id: string;
  label: string;
  tooltipLabel: string;
  cordial: number;
  morar: number;
  total: number;
  insight: string;
};

type MutableAttendancePoint = AttendanceChartPoint & {
  start: Date;
  end: Date;
};

type AttendanceTooltipPayload = {
  dataKey?: SeriesKey;
  payload?: AttendanceChartPoint;
};

const SERIES: Array<{
  key: SeriesKey;
  label: string;
  color: string;
  description: string;
  dashed?: boolean;
}> = [
  {
    key: "cordial",
    label: "Cordial",
    color: chartCordial,
    description: "Linha sólida azul",
  },
  {
    key: "morar",
    label: "Morar",
    color: chartMorar,
    description: "Linha sólida cobre",
  },
  {
    key: "total",
    label: "Total",
    color: chartSystem,
    description: "Linha destacada consolidada",
    dashed: true,
  },
];

const PERIOD_OPTIONS: Array<{ key: PeriodMode; label: string; shortLabel: string }> = [
  { key: "week", label: "Semana", shortLabel: "7 dias" },
  { key: "month", label: "Mês", shortLabel: "Mês" },
  { key: "year", label: "Ano", shortLabel: "Ano" },
  { key: "custom", label: "Personalizado", shortLabel: "Custom" },
];

const MS_DAY = 24 * 60 * 60 * 1000;

const initialVisibleSeries: Record<SeriesKey, boolean> = {
  cordial: true,
  morar: true,
  total: true,
};

const EMPTY_ATTENDANCES: Atendimento[] = [];

export function AttendanceEvolutionCard({ className }: { className?: string }) {
  const session = useSession();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [customStart, setCustomStart] = useState(() => toDateInputValue(startOfYear(new Date())));
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [visibleSeries, setVisibleSeries] =
    useState<Record<SeriesKey, boolean>>(initialVisibleSeries);
  const [hoveredSeries, setHoveredSeries] = useState<SeriesKey | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const attendancesQuery = useQuery({
    queryKey: ATTENDANCES_QUERY_KEY,
    queryFn: () => listAttendances(),
    enabled: Boolean(session),
    staleTime: 15_000,
  });

  const attendances = attendancesQuery.data ?? EMPTY_ATTENDANCES;
  const periodRange = useMemo(
    () => getPeriodRange(periodMode, customStart, customEnd),
    [customEnd, customStart, periodMode],
  );
  const periodLabel = useMemo(
    () => formatPeriodLabel(periodMode, periodRange),
    [periodMode, periodRange],
  );
  const chartData = useMemo(
    () => buildAttendanceSeries(attendances, periodRange, periodMode),
    [attendances, periodMode, periodRange],
  );
  const previousRange = useMemo(
    () => getPreviousRange(periodRange, periodMode),
    [periodMode, periodRange],
  );
  const previousTotal = useMemo(
    () => countAttendancesInRange(attendances, previousRange),
    [attendances, previousRange],
  );
  const summary = useMemo(() => buildSummary(chartData, previousTotal), [chartData, previousTotal]);
  const hasAnyAttendance = attendances.length > 0;
  const hasFilteredData = summary.total > 0;

  function toggleSeries(key: SeriesKey) {
    setVisibleSeries((current) => {
      const activeCount = SERIES.filter((series) => current[series.key]).length;
      if (current[key] && activeCount === 1) return current;
      return { ...current, [key]: !current[key] };
    });
  }

  if (attendancesQuery.isLoading) {
    return <AttendanceEvolutionSkeleton className={className} />;
  }

  return (
    <section
      className={cn(
        "relative w-full min-w-0 rounded-3xl p-3 shadow-[0_24px_70px_-28px_rgba(23,27,33,0.28)] sm:p-5 xl:col-span-2",
        className,
      )}
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.82) 0%, rgba(251,248,244,0.66) 44%, rgba(245,241,235,0.72) 100%)",
        backdropFilter: "blur(22px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.68)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.92), transparent)",
        }}
      />

      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/58 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-[0_10px_24px_-20px_rgba(30,100,125,0.7)]">
            <Sparkles className="size-3 text-[var(--system-accent-dark)]" />
            Evolução comercial
          </div>
          <h3 className="mt-3 max-w-[36rem] text-[1.35rem] font-black leading-tight tracking-tight text-foreground sm:text-2xl">
            Evolução mensal de atendimentos
          </h3>
          <p className="mt-1.5 max-w-[42rem] text-sm leading-relaxed text-foreground/58">
            Compare o crescimento da Cordial, Morar e total consolidado no período selecionado.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <SummaryPill
              label="Total do período"
              value={String(summary.total)}
              detail={periodLabel}
            />
            <SummaryPill
              label="Maior pico"
              value={String(summary.peakValue)}
              detail={summary.peakLabel}
            />
            <SummaryPill
              label="Melhor imobiliária"
              value={summary.bestAgency}
              detail={summary.bestAgencyDetail}
              color={summary.bestAgencyColor}
            />
            {summary.growthLabel && (
              <SummaryPill
                label="Período anterior"
                value={summary.growthLabel}
                detail="comparação real"
                trend={summary.growthTone}
              />
            )}
          </div>
        </div>

        <PeriodFilterCard
          periodMode={periodMode}
          periodLabel={periodLabel}
          customStart={customStart}
          customEnd={customEnd}
          onPeriodModeChange={setPeriodMode}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          isFetching={attendancesQuery.isFetching}
        />
      </div>

      <div className="mt-5 min-w-0 rounded-[1.35rem] border border-white/70 bg-white/40 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:p-3">
        <div className="relative h-[20rem] min-w-0 sm:h-[22rem] lg:h-[25rem]">
          {attendancesQuery.isError ? (
            <ChartState
              icon={<AlertTriangle className="size-5" />}
              title="Não foi possível carregar os atendimentos."
              text="A página continua disponível. Tente atualizar ou conferir sua conexão."
              tone="error"
            />
          ) : !hasAnyAttendance ? (
            <ChartState
              icon={<LineChartIcon className="size-5" />}
              title="Nenhum atendimento neste período."
              text="Quando novos atendimentos forem cadastrados, a evolução aparecerá aqui."
            />
          ) : !hasFilteredData ? (
            <ChartState
              icon={<CalendarRange className="size-5" />}
              title="Sem dados para o filtro selecionado."
              text="Altere o período para visualizar a evolução dos atendimentos."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart
                data={chartData}
                margin={{ left: -8, right: 14, top: 18, bottom: 6 }}
                onMouseLeave={() => setHoveredSeries(null)}
              >
                <defs>
                  <filter id="attendance-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="5" floodOpacity="0.16" />
                  </filter>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="4 8" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  minTickGap={18}
                  tick={{ fontSize: 11, fill: "rgba(42,48,56,0.58)", fontWeight: 700 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: "rgba(42,48,56,0.54)", fontWeight: 700 }}
                />
                <Tooltip
                  content={<AttendanceTooltip />}
                  cursor={{
                    stroke: "rgba(30,100,125,0.18)",
                    strokeWidth: 1.5,
                    strokeDasharray: "5 5",
                  }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={{ outline: "none", zIndex: 20 }}
                />
                {SERIES.map((series) =>
                  visibleSeries[series.key] ? (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={series.key === "total" ? 3.25 : 2.65}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={series.dashed ? "7 5" : undefined}
                      strokeOpacity={getSeriesOpacity(series.key, hoveredSeries)}
                      filter={series.key === "total" ? "url(#attendance-line-glow)" : undefined}
                      dot={{
                        r: 2.35,
                        strokeWidth: 1.5,
                        stroke: "rgba(255,255,255,0.92)",
                        fill: series.color,
                        fillOpacity: 0.82,
                      }}
                      activeDot={{
                        r: series.key === "total" ? 7 : 6,
                        strokeWidth: 3,
                        stroke: "rgba(255,255,255,0.95)",
                        fill: series.color,
                      }}
                      animationDuration={
                        prefersReducedMotion ? 0 : series.key === "total" ? 900 : 780
                      }
                      animationEasing="ease-out"
                      onMouseEnter={() => setHoveredSeries(series.key)}
                    />
                  ) : null,
                )}
              </RechartsLineChart>
            </ResponsiveContainer>
          )}
        </div>

        <LegendChips
          visibleSeries={visibleSeries}
          hoveredSeries={hoveredSeries}
          onHover={setHoveredSeries}
          onToggle={toggleSeries}
        />
      </div>
    </section>
  );
}

function PeriodFilterCard({
  periodMode,
  periodLabel,
  customStart,
  customEnd,
  onPeriodModeChange,
  onCustomStartChange,
  onCustomEndChange,
  isFetching,
}: {
  periodMode: PeriodMode;
  periodLabel: string;
  customStart: string;
  customEnd: string;
  onPeriodModeChange: (value: PeriodMode) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  isFetching: boolean;
}) {
  return (
    <div className="w-full shrink-0 rounded-2xl border border-white/70 bg-white/58 p-2.5 shadow-[0_18px_36px_-26px_rgba(23,27,33,0.28)] lg:w-[21rem]">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-foreground/42">
            Período dos dados
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-foreground">{periodLabel}</p>
        </div>
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-2xl text-primary transition-transform duration-200 motion-reduce:transition-none",
            isFetching ? "bg-primary/12" : "bg-[rgba(30,100,125,0.09)] hover:scale-105",
          )}
          aria-hidden="true"
        >
          {isFetching ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <CalendarRange className="size-4" />
          )}
        </span>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {PERIOD_OPTIONS.map((option) => {
          const active = periodMode === option.key;
          return (
            <button
              key={option.key}
              type="button"
              className={cn(
                "min-h-9 shrink-0 rounded-full px-3 text-xs font-black transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none",
                active
                  ? "bg-primary text-white shadow-[0_12px_24px_-16px_rgba(30,100,125,0.95)]"
                  : "bg-white/62 text-foreground/58 ring-1 ring-foreground/8 hover:-translate-y-0.5 hover:text-primary",
              )}
              aria-pressed={active}
              onClick={() => onPeriodModeChange(option.key)}
            >
              <span className="hidden sm:inline">{option.label}</span>
              <span className="sm:hidden">{option.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {periodMode === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <DateInput label="Início" value={customStart} onChange={onCustomStartChange} />
          <DateInput label="Final" value={customEnd} onChange={onCustomEndChange} />
        </div>
      )}
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.16em] text-foreground/40">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full min-w-0 rounded-xl border border-foreground/10 bg-white/76 px-2 text-xs font-bold text-foreground shadow-inner outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function SummaryPill({
  label,
  value,
  detail,
  color,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
  trend?: "up" | "down" | "flat";
}) {
  const trendClass =
    trend === "up" ? "text-emerald-700" : trend === "down" ? "text-destructive" : "text-foreground";

  return (
    <div className="min-w-0 rounded-2xl border border-white/72 bg-white/48 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.15em] text-foreground/40">
        {label}
      </p>
      <p
        className={cn("mt-1 truncate text-base font-black leading-none", trendClass)}
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-medium text-foreground/46">{detail}</p>
    </div>
  );
}

function AttendanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: AttendanceTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;

  const point = payload.find((item) => item.payload)?.payload;
  if (!point) return null;

  return (
    <div className="min-w-[13.5rem] rounded-2xl border border-white/74 bg-white/96 p-3 text-xs shadow-[0_22px_50px_-20px_rgba(23,27,33,0.34)] backdrop-blur-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/62">
        {point.tooltipLabel}
      </p>
      <div className="mt-2 space-y-1.5">
        {SERIES.map((series) => (
          <TooltipRow
            key={series.key}
            label={series.label}
            value={point[series.key] ?? 0}
            color={series.color}
            dashed={series.dashed}
          />
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-[rgba(30,100,125,0.07)] px-2.5 py-2 text-[11px] font-semibold leading-snug text-primary">
        {point.insight}
      </div>
    </div>
  );
}

function TooltipRow({
  label,
  value,
  color,
  dashed,
}: {
  label: string;
  value: number;
  color: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="flex min-w-0 items-center gap-2 text-foreground/64">
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-5 shrink-0 rounded-full", dashed && "border-t border-dashed")}
          style={{
            background: dashed ? "transparent" : color,
            borderColor: color,
          }}
        />
        {label}
      </span>
      <span className="font-mono text-sm font-black tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function LegendChips({
  visibleSeries,
  hoveredSeries,
  onHover,
  onToggle,
}: {
  visibleSeries: Record<SeriesKey, boolean>;
  hoveredSeries: SeriesKey | null;
  onHover: (value: SeriesKey | null) => void;
  onToggle: (value: SeriesKey) => void;
}) {
  return (
    <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1">
      {SERIES.map((series) => {
        const active = visibleSeries[series.key];
        const dimmed = hoveredSeries && hoveredSeries !== series.key;
        return (
          <button
            key={series.key}
            type="button"
            className={cn(
              "group inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-black transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none",
              active
                ? "border-white/72 bg-white/70 text-foreground shadow-[0_12px_26px_-22px_rgba(23,27,33,0.38)]"
                : "border-foreground/8 bg-white/28 text-foreground/38",
              dimmed && "opacity-45",
            )}
            aria-pressed={active}
            aria-label={`${series.label}: ${active ? "visível" : "oculta"}. ${series.description}`}
            onClick={() => onToggle(series.key)}
            onMouseEnter={() => onHover(series.key)}
            onMouseLeave={() => onHover(null)}
          >
            <span
              className={cn("h-1.5 w-6 rounded-full", series.dashed && "border-t border-dashed")}
              style={{
                background: series.dashed ? "transparent" : series.color,
                borderColor: series.color,
              }}
              aria-hidden="true"
            />
            {series.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartState({
  icon,
  title,
  text,
  tone = "empty",
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone?: "empty" | "error";
}) {
  return (
    <div className="absolute inset-0 grid place-items-center px-4">
      <div
        className={cn(
          "max-w-[24rem] rounded-3xl border bg-white/72 p-5 text-center shadow-[0_18px_50px_-26px_rgba(23,27,33,0.28)] backdrop-blur-xl",
          tone === "error" ? "border-destructive/18" : "border-white/78",
        )}
      >
        <span
          className={cn(
            "mx-auto grid size-11 place-items-center rounded-2xl",
            tone === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-[rgba(30,100,125,0.1)] text-primary",
          )}
        >
          {icon}
        </span>
        <p className="mt-3 text-sm font-black text-foreground">{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/55">{text}</p>
      </div>
    </div>
  );
}

function AttendanceEvolutionSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "w-full min-w-0 rounded-3xl border border-white/68 bg-white/58 p-3 shadow-[0_24px_70px_-30px_rgba(23,27,33,0.24)] sm:p-5 xl:col-span-2",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="h-7 w-44 animate-pulse rounded-full bg-primary/10 motion-reduce:animate-none" />
          <div className="mt-4 h-8 w-4/5 max-w-[30rem] animate-pulse rounded-xl bg-foreground/8 motion-reduce:animate-none" />
          <div className="mt-2 h-4 w-11/12 max-w-[36rem] animate-pulse rounded-lg bg-foreground/6 motion-reduce:animate-none" />
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-2xl bg-white/70 motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
        <div className="h-28 w-full animate-pulse rounded-2xl bg-white/72 motion-reduce:animate-none lg:w-[21rem]" />
      </div>
      <div className="mt-5 h-[20rem] animate-pulse rounded-[1.35rem] bg-white/52 motion-reduce:animate-none sm:h-[22rem] lg:h-[25rem]" />
    </section>
  );
}

function buildAttendanceSeries(
  attendances: Atendimento[],
  range: DateRange,
  periodMode: PeriodMode,
): AttendanceChartPoint[] {
  const granularity = getGranularity(range, periodMode);
  const buckets = buildBuckets(range, granularity);

  attendances.forEach((attendance) => {
    const created = parseAttendanceDate(attendance.criadoEm);
    if (!created || created < range.start || created > range.end) return;

    const bucket = buckets.find((item) => created >= item.start && created <= item.end);
    if (!bucket) return;

    bucket.total += 1;
    if (attendance.imobiliaria === "cordial") bucket.cordial += 1;
    if (attendance.imobiliaria === "morar") bucket.morar += 1;
  });

  return buckets.map((bucket, index) => ({
    id: bucket.id,
    label: bucket.label,
    tooltipLabel: bucket.tooltipLabel,
    cordial: bucket.cordial,
    morar: bucket.morar,
    total: bucket.total,
    insight: getPointInsight(bucket, buckets[index - 1]),
  }));
}

function buildBuckets(range: DateRange, granularity: Granularity): MutableAttendancePoint[] {
  if (granularity === "month") return buildMonthBuckets(range);
  if (granularity === "week") return buildWeekBuckets(range);
  return buildDayBuckets(range);
}

function buildDayBuckets(range: DateRange): MutableAttendancePoint[] {
  const buckets: MutableAttendancePoint[] = [];
  let cursor = startOfDay(range.start);

  while (cursor <= range.end) {
    const start = startOfDay(cursor);
    const end = endOfDay(cursor);
    buckets.push(
      createBucket(start, minDate(end, range.end), formatDayLabel(start), formatFullDate(start)),
    );
    cursor = addDays(cursor, 1);
  }

  return buckets;
}

function buildWeekBuckets(range: DateRange): MutableAttendancePoint[] {
  const buckets: MutableAttendancePoint[] = [];
  let cursor = startOfDay(range.start);

  while (cursor <= range.end) {
    const start = startOfDay(cursor);
    const end = minDate(endOfDay(addDays(start, 6)), range.end);
    buckets.push(
      createBucket(
        start,
        end,
        `${formatDayLabel(start)}-${formatDayLabel(end)}`,
        formatRangeLabel(start, end),
      ),
    );
    cursor = addDays(start, 7);
  }

  return buckets;
}

function buildMonthBuckets(range: DateRange): MutableAttendancePoint[] {
  const buckets: MutableAttendancePoint[] = [];
  let cursor = startOfMonth(range.start);

  while (cursor <= range.end) {
    const start = maxDate(startOfMonth(cursor), range.start);
    const end = minDate(endOfMonth(cursor), range.end);
    buckets.push(createBucket(start, end, formatMonthYear(start), formatMonthLong(start)));
    cursor = addMonths(cursor, 1);
  }

  return buckets;
}

function createBucket(
  start: Date,
  end: Date,
  label: string,
  tooltipLabel: string,
): MutableAttendancePoint {
  return {
    id: `${toDateInputValue(start)}-${toDateInputValue(end)}`,
    start,
    end,
    label,
    tooltipLabel,
    cordial: 0,
    morar: 0,
    total: 0,
    insight: "Sem registros no período",
  };
}

function buildSummary(chartData: AttendanceChartPoint[], previousTotal: number) {
  const total = chartData.reduce((sum, point) => sum + point.total, 0);
  const cordial = chartData.reduce((sum, point) => sum + point.cordial, 0);
  const morar = chartData.reduce((sum, point) => sum + point.morar, 0);
  const peak = chartData.reduce<AttendanceChartPoint | null>(
    (current, point) => (!current || point.total > current.total ? point : current),
    null,
  );
  const growth =
    previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null;

  return {
    total,
    peakValue: peak?.total ?? 0,
    peakLabel: peak && peak.total > 0 ? peak.label : "Sem pico",
    bestAgency:
      cordial === 0 && morar === 0
        ? "Sem destaque"
        : cordial === morar
          ? "Equilíbrio"
          : cordial > morar
            ? "Cordial"
            : "Morar",
    bestAgencyDetail:
      cordial === 0 && morar === 0
        ? "aguardando dados"
        : cordial === morar
          ? `${cordial} x ${morar}`
          : cordial > morar
            ? `${cordial} atendimentos`
            : `${morar} atendimentos`,
    bestAgencyColor: cordial === morar ? chartSystem : cordial > morar ? chartCordial : chartMorar,
    growthLabel: growth === null ? null : `${growth > 0 ? "+" : ""}${growth}%`,
    growthTone: growth === null ? undefined : growth > 0 ? "up" : growth < 0 ? "down" : "flat",
  } as const;
}

function getPointInsight(point: MutableAttendancePoint, previous?: MutableAttendancePoint) {
  if (point.total === 0) return "Sem registros no período";
  if (previous && point.total > previous.total) return "Total consolidado em alta";
  if (previous && point.morar > previous.morar) return "Morar teve crescimento";
  if (point.cordial > point.morar) return "Cordial liderou no período";
  if (point.morar > point.cordial) return "Morar liderou no período";
  return "Cordial e Morar equilibradas no período";
}

function countAttendancesInRange(attendances: Atendimento[], range: DateRange) {
  return attendances.reduce((sum, attendance) => {
    const created = parseAttendanceDate(attendance.criadoEm);
    return created && created >= range.start && created <= range.end ? sum + 1 : sum;
  }, 0);
}

function getSeriesOpacity(series: SeriesKey, hoveredSeries: SeriesKey | null) {
  if (!hoveredSeries) return 1;
  return hoveredSeries === series ? 1 : 0.28;
}

function getGranularity(range: DateRange, periodMode: PeriodMode): Granularity {
  if (periodMode === "year") return "month";
  const days = differenceInDays(range.start, range.end) + 1;
  if (periodMode === "month") return "day";
  if (days <= 45) return "day";
  if (days <= 150) return "week";
  return "month";
}

function getPeriodRange(periodMode: PeriodMode, customStart: string, customEnd: string): DateRange {
  const today = endOfDay(new Date());

  if (periodMode === "week") {
    return { start: startOfDay(addDays(today, -6)), end: today };
  }

  if (periodMode === "month") {
    return { start: startOfMonth(today), end: today };
  }

  if (periodMode === "year") {
    return { start: startOfYear(today), end: today };
  }

  const start = parseInputDate(customStart) ?? startOfYear(today);
  const end = parseInputDate(customEnd) ?? today;

  return {
    start: startOfDay(minDate(start, end)),
    end: endOfDay(maxDate(start, end)),
  };
}

function getPreviousRange(range: DateRange, periodMode: PeriodMode): DateRange {
  if (periodMode === "month") {
    const previousMonth = addMonths(range.start, -1);
    return {
      start: startOfMonth(previousMonth),
      end: endOfDay(addDays(startOfMonth(range.start), -1)),
    };
  }

  if (periodMode === "year") {
    const previousYear = new Date(range.start);
    previousYear.setFullYear(previousYear.getFullYear() - 1);
    return {
      start: startOfYear(previousYear),
      end: endOfDay(addDays(startOfYear(range.start), -1)),
    };
  }

  const days = differenceInDays(range.start, range.end) + 1;
  return {
    start: startOfDay(addDays(range.start, -days)),
    end: endOfDay(addDays(range.start, -1)),
  };
}

function formatPeriodLabel(periodMode: PeriodMode, range: DateRange) {
  if (periodMode === "week") return "Últimos 7 dias";
  if (periodMode === "month") return "Este mês";
  if (periodMode === "year") return "Ano atual";
  return formatRangeLabel(range.start, range.end);
}

function formatRangeLabel(start: Date, end: Date) {
  return `${formatFullDate(start)} - ${formatFullDate(end)}`;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMonthYear(date: Date) {
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${capitalize(month)}/${date.getFullYear()}`;
}

function formatMonthLong(date: Date) {
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${capitalize(month)}/${date.getFullYear()}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseAttendanceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfYear(date: Date) {
  return startOfDay(new Date(date.getFullYear(), 0, 1));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function differenceInDays(start: Date, end: Date) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / MS_DAY);
}

function minDate(first: Date, second: Date) {
  return first <= second ? first : second;
}

function maxDate(first: Date, second: Date) {
  return first >= second ? first : second;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
