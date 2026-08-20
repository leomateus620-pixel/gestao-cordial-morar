import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  LineChart as LineChartIcon,
  SlidersHorizontal,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
    description: "Área azul",
  },
  {
    key: "morar",
    label: "Morar",
    color: chartMorar,
    description: "Área cobre",
  },
  {
    key: "total",
    label: "Total",
    color: chartSystem,
    description: "Linha consolidada",
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
  const isMobile = useIsMobile();
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
  const filtersDirty =
    periodMode !== "month" || SERIES.some((series) => !visibleSeries[series.key]);
  const rangeLabel = formatRangeShort(periodRange);

  function toggleSeries(key: SeriesKey) {
    setVisibleSeries((current) => {
      const activeCount = SERIES.filter((series) => current[series.key]).length;
      if (current[key] && activeCount === 1) return current;
      return { ...current, [key]: !current[key] };
    });
  }

  const filterPanel = (
    <FilterPanel
      periodMode={periodMode}
      customStart={customStart}
      customEnd={customEnd}
      visibleSeries={visibleSeries}
      onPeriodModeChange={setPeriodMode}
      onCustomStartChange={setCustomStart}
      onCustomEndChange={setCustomEnd}
      onToggleSeries={toggleSeries}
    />
  );

  if (attendancesQuery.isLoading) {
    return <AttendanceEvolutionSkeleton className={className} />;
  }

  return (
    <section
      className={cn(
        "relative w-full min-w-0 rounded-3xl p-3 shadow-[0_24px_70px_-30px_rgba(23,27,33,0.24)] sm:p-5 xl:col-span-2",
        className,
      )}
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.82) 0%, rgba(251,248,244,0.66) 44%, rgba(245,241,235,0.72) 100%)",
        backdropFilter: "blur(22px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.68)",
      }}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 border-l-[3px] border-primary pl-3">
          <h3 className="text-[1.3rem] font-black leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[1.6rem]">
            Evolução de atendimentos
          </h3>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-foreground/45">
            {periodLabel} · {rangeLabel}
          </p>
        </div>

        {isMobile ? (
          <Sheet>
            <SheetTrigger asChild>
              <FilterIconButton active={filtersDirty} />
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-[1.75rem] border-white/60 bg-background/95 p-5 backdrop-blur-2xl"
            >
              <SheetHeader className="mb-4 text-left">
                <SheetTitle className="text-base font-black">Filtros do gráfico</SheetTitle>
              </SheetHeader>
              {filterPanel}
            </SheetContent>
          </Sheet>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <FilterIconButton active={filtersDirty} />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[19rem] rounded-2xl border-white/70 bg-white/95 p-4 backdrop-blur-2xl"
            >
              {filterPanel}
            </PopoverContent>
          </Popover>
        )}
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryStat label="Total no período" value={String(summary.total)} detail="atendimentos" />
        <SummaryStat
          label="Pico"
          value={String(summary.peakValue)}
          detail={summary.peakLabel}
          color={chartSystem}
        />
        <SummaryStat
          label="Imobiliária líder"
          value={summary.bestAgency}
          detail={summary.bestAgencyDetail}
          color={summary.bestAgencyColor}
        />
        <SummaryStat
          label="Vs. anterior"
          value={summary.growthLabel ?? "—"}
          detail={summary.growthLabel ? `${previousTotal} antes` : "sem base"}
          trend={summary.growthTone}
        />
      </div>

      <div className="mt-4 min-w-0">
        <div className="relative h-[17rem] min-w-0 sm:h-[20rem] lg:h-[23rem]">
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
              <ComposedChart
                data={chartData}
                margin={{ left: -6, right: 12, top: 16, bottom: 4 }}
                onMouseLeave={() => setHoveredSeries(null)}
              >
                <defs>
                  <linearGradient id="attendance-fill-cordial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartCordial} stopOpacity={0.46} />
                    <stop offset="100%" stopColor={chartCordial} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="attendance-fill-morar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartMorar} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={chartMorar} stopOpacity={0.04} />
                  </linearGradient>
                  <filter id="attendance-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="5" floodOpacity="0.18" />
                  </filter>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="4 8" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  minTickGap={isMobile ? 34 : 22}
                  tick={{ fontSize: 10, fill: "rgba(42,48,56,0.5)", fontWeight: 700 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  tickCount={4}
                  tickMargin={6}
                  tick={{ fontSize: 10, fill: "rgba(42,48,56,0.42)", fontWeight: 700 }}
                />
                <Tooltip
                  content={<AttendanceTooltip />}
                  cursor={{
                    stroke: "rgba(30,100,125,0.28)",
                    strokeWidth: 1.5,
                  }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={{ outline: "none", zIndex: 20 }}
                />
                {visibleSeries.cordial && (
                  <Area
                    type="monotone"
                    dataKey="cordial"
                    name="Cordial"
                    stroke={chartCordial}
                    strokeWidth={2.4}
                    fill="url(#attendance-fill-cordial)"
                    strokeOpacity={getSeriesOpacity("cordial", hoveredSeries)}
                    fillOpacity={hoveredSeries && hoveredSeries !== "cordial" ? 0.25 : 1}
                    activeDot={{
                      r: 5.5,
                      strokeWidth: 3,
                      stroke: "rgba(255,255,255,0.95)",
                      fill: chartCordial,
                    }}
                    dot={false}
                    animationDuration={prefersReducedMotion ? 0 : 760}
                    onMouseEnter={() => setHoveredSeries("cordial")}
                  />
                )}
                {visibleSeries.morar && (
                  <Area
                    type="monotone"
                    dataKey="morar"
                    name="Morar"
                    stroke={chartMorar}
                    strokeWidth={2.4}
                    fill="url(#attendance-fill-morar)"
                    strokeOpacity={getSeriesOpacity("morar", hoveredSeries)}
                    fillOpacity={hoveredSeries && hoveredSeries !== "morar" ? 0.25 : 1}
                    activeDot={{
                      r: 5.5,
                      strokeWidth: 3,
                      stroke: "rgba(255,255,255,0.95)",
                      fill: chartMorar,
                    }}
                    dot={false}
                    animationDuration={prefersReducedMotion ? 0 : 760}
                    onMouseEnter={() => setHoveredSeries("morar")}
                  />
                )}
                {visibleSeries.total && (
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke={chartSystem}
                    strokeWidth={3.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={getSeriesOpacity("total", hoveredSeries)}
                    filter="url(#attendance-line-glow)"
                    dot={false}
                    activeDot={{
                      r: 7,
                      strokeWidth: 3,
                      stroke: "rgba(255,255,255,0.95)",
                      fill: chartSystem,
                    }}
                    animationDuration={prefersReducedMotion ? 0 : 900}
                    animationEasing="ease-out"
                    onMouseEnter={() => setHoveredSeries("total")}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 pl-1">
          {SERIES.filter((series) => visibleSeries[series.key]).map((series) => (
            <span
              key={series.key}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-4 rounded-full"
                style={{ background: series.color }}
              />
              {series.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FilterIconButton({ active, ...props }: { active: boolean } & Record<string, unknown>) {
  return (
    <button
      type="button"
      {...props}
      aria-label="Filtros do gráfico"
      className="relative grid size-10 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white/70 text-foreground/65 shadow-[0_14px_30px_-24px_rgba(23,27,33,0.4)] transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
    >
      <SlidersHorizontal className="size-4" />
      {active && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-white"
        />
      )}
    </button>
  );
}

function FilterPanel({
  periodMode,
  customStart,
  customEnd,
  visibleSeries,
  onPeriodModeChange,
  onCustomStartChange,
  onCustomEndChange,
  onToggleSeries,
}: {
  periodMode: PeriodMode;
  customStart: string;
  customEnd: string;
  visibleSeries: Record<SeriesKey, boolean>;
  onPeriodModeChange: (value: PeriodMode) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onToggleSeries: (value: SeriesKey) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-foreground/42">
          Período
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {PERIOD_OPTIONS.map((option) => {
            const active = periodMode === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => onPeriodModeChange(option.key)}
                className={cn(
                  "min-h-9 rounded-xl px-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                  active
                    ? "bg-primary text-white"
                    : "bg-foreground/[0.05] text-foreground/60 hover:text-primary",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {periodMode === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <DateInput label="Início" value={customStart} onChange={onCustomStartChange} />
          <DateInput label="Final" value={customEnd} onChange={onCustomEndChange} />
        </div>
      )}

      <div>
        <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-foreground/42">
          Séries
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((series) => {
            const active = visibleSeries[series.key];
            return (
              <button
                key={series.key}
                type="button"
                aria-pressed={active}
                aria-label={`${series.label}: ${active ? "visível" : "oculta"}. ${series.description}`}
                onClick={() => onToggleSeries(series.key)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                  active
                    ? "border-foreground/10 bg-white text-foreground"
                    : "border-transparent bg-foreground/[0.05] text-foreground/38",
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-4 rounded-full"
                  style={{ background: active ? series.color : "rgba(42,48,56,0.2)" }}
                />
                {series.label}
              </button>
            );
          })}
        </div>
      </div>
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

function SummaryStat({
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
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  const trendClass =
    trend === "up"
      ? "text-emerald-700"
      : trend === "down"
        ? "text-destructive"
        : "text-foreground";

  return (
    <div className="min-w-0 rounded-2xl bg-white/55 px-3 py-2.5 ring-1 ring-white/70">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-foreground/40">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1 truncate text-lg font-black leading-none tabular-nums",
          trend ? trendClass : "text-foreground",
        )}
        style={color && !trend ? { color } : undefined}
      >
        {trend && <TrendIcon className="size-4 shrink-0" aria-hidden="true" />}
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-semibold text-foreground/45">{detail}</p>
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
    <div className="min-w-[12rem] rounded-2xl border border-white/74 bg-white/97 p-3 text-xs shadow-[0_22px_50px_-20px_rgba(23,27,33,0.34)] backdrop-blur-xl">
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
          />
        ))}
      </div>
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="flex min-w-0 items-center gap-2 text-foreground/64">
        <span
          aria-hidden="true"
          className="h-1.5 w-5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        {label}
      </span>
      <span className="font-mono text-sm font-black tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function formatRangeShort(range: DateRange) {
  const fmt = (date: Date) =>
    date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(range.start)} – ${fmt(range.end)}`;
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
