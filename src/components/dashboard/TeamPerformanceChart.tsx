import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, BarChart3, Check, Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { axisTick, chartCordial, chartMorar, chartSystem } from "@/lib/chart-palette";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { EquipePeriodo, EquipePerformanceResult } from "@/lib/equipe/equipe.functions";
import { calculateCorretoresSummary } from "@/services/corretores";

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

const SERIES: Record<MetricKey, { color: string; label: string; short: string }> = {
  atendimentos: { color: chartCordial, label: "Atendimentos", short: "Atend." },
  contratos: { color: chartMorar, label: "Contratos", short: "Contratos" },
  agenciamentos: { color: chartSystem, label: "Agenciamentos", short: "Agenc." },
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

type TooltipPayload = { payload?: ChartRow };

export function TeamPerformanceChart({
  data,
  periodo,
  onPeriodoChange,
  isLoading,
  isFetching,
  isError,
  className,
}: Props) {
  const [visibleMetrics, setVisibleMetrics] = useState<VisibleMetrics>(DEFAULT_VISIBLE_METRICS);

  const chartData = useMemo<ChartRow[]>(
    () =>
      data.rows.map((r) => ({
        nome: r.nome.trim().split(/\s+/)[0] ?? "—",
        nomeCompleto: r.nome,
        atendimentos: r.atendimentosRecebidos,
        contratos: r.contratosFechados,
        agenciamentos: r.agenciamentosFeitos,
        conversao: r.taxaConversao,
        total: r.atendimentosRecebidos + r.contratosFechados + r.agenciamentosFeitos,
      })),
    [data.rows],
  );
  const totals = useMemo(() => calculateCorretoresSummary(data.rows), [data.rows]);

  const visibleKeys = useMemo(
    () => METRIC_KEYS.filter((key) => visibleMetrics[key]),
    [visibleMetrics],
  );
  const hasData = chartData.some((row) => row.total > 0);
  const selectedPeriod = PERIODOS.find((p) => p.value === periodo) ?? PERIODOS[0];

  const leader = useMemo(() => {
    if (!hasData) return null;
    return chartData.reduce<ChartRow | null>((best, row) => {
      const rowScore = getVisibleTotal(row, visibleKeys);
      const bestScore = best ? getVisibleTotal(best, visibleKeys) : -1;
      return rowScore > bestScore ? row : best;
    }, null);
  }, [chartData, hasData, visibleKeys]);

  const chartHeight = useMemo(() => {
    const rowCount = Math.max(chartData.length, 1);
    const rowHeight = visibleKeys.length === 1 ? 46 : 30 + visibleKeys.length * 16;
    return Math.min(420, Math.max(220, rowCount * rowHeight + 24));
  }, [chartData.length, visibleKeys.length]);

  const barSize = visibleKeys.length === 1 ? 16 : 9;
  const shouldAnimate =
    typeof window === "undefined"
      ? false
      : !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const showSkeleton = isLoading && !isError;
  const showFetchingBadge = isFetching && !showSkeleton && !isError;

  const isDefaultFilters =
    periodo === "mes" && METRIC_KEYS.every((key) => visibleMetrics[key] === true);

  const toggleMetric = (key: MetricKey) => {
    setVisibleMetrics((current) => {
      const next = { ...current, [key]: !current[key] };
      return METRIC_KEYS.some((metric) => next[metric]) ? next : DEFAULT_VISIBLE_METRICS;
    });
  };

  const filtersBody = (
    <FiltersBody
      periodo={periodo}
      onPeriodoChange={onPeriodoChange}
      visibleMetrics={visibleMetrics}
      onToggleMetric={toggleMetric}
      onReset={() => {
        setVisibleMetrics(DEFAULT_VISIBLE_METRICS);
        onPeriodoChange("mes");
      }}
      isDefault={isDefaultFilters}
    />
  );

  return (
    <section
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-[1.5rem] border border-border/50 bg-card/80 p-4 shadow-[0_18px_44px_-34px_rgba(23,27,33,0.42)] backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      <header className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 border-l-2 border-primary/70 pl-3">
          <h3 className="text-balance text-[1.15rem] font-black leading-[1.12] tracking-[-0.025em] text-foreground sm:text-[1.4rem]">
            <span style={{ color: SERIES.atendimentos.color }}>Atendimentos</span>,{" "}
            <span style={{ color: SERIES.contratos.color }}>contratos</span> e{" "}
            <span style={{ color: SERIES.agenciamentos.color }}>agenciamentos</span>
          </h3>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
            {showFetchingBadge ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {showFetchingBadge ? "Atualizando" : selectedPeriod.helper}
          </p>
        </div>

        <FiltersTrigger
          isDefault={isDefaultFilters}
          body={filtersBody}
          activeLabel={selectedPeriod.label}
        />
      </header>

      <div className="relative z-10 mt-4 grid grid-cols-3 divide-x divide-border/50 rounded-2xl border border-border/45 bg-background/45 py-2.5">
        <SummaryStat metric="atendimentos" value={totals.atendimentosRecebidos} />
        <SummaryStat metric="contratos" value={totals.contratosFechados} />
        <SummaryStat metric="agenciamentos" value={totals.agenciamentosFeitos} />
      </div>

      <div className="relative z-10 mt-3 w-full min-w-0" style={{ height: chartHeight }}>
        {showSkeleton ? (
          <SkeletonChart />
        ) : isError ? (
          <ErrorChart periodoLabel={selectedPeriod.label} />
        ) : hasData ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart
              accessibilityLayer
              data={chartData}
              layout="vertical"
              margin={{ left: 0, right: 44, top: 4, bottom: 4 }}
              barCategoryGap={visibleKeys.length === 1 ? "42%" : "30%"}
              barGap={3}
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                dataKey="nome"
                type="category"
                width={72}
                interval={0}
                tickLine={false}
                axisLine={false}
                tick={{
                  ...axisTick,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  fill: "rgba(42,48,56,0.72)",
                }}
                tickFormatter={(value) => truncateLabel(String(value), 10)}
              />
              <Tooltip
                cursor={{ fill: "rgba(30,100,125,0.05)" }}
                wrapperStyle={{ outline: "none", zIndex: 50 }}
                content={
                  <RichTooltip periodoLabel={selectedPeriod.label} visibleKeys={visibleKeys} />
                }
              />
              {visibleKeys.map((key, index) => {
                const serie = SERIES[key];
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={serie.label}
                    radius={999}
                    minPointSize={3}
                    barSize={barSize}
                    background={{ fill: "rgba(23,27,33,0.045)", radius: 999 }}
                    isAnimationActive={shouldAnimate}
                    animationDuration={620 + index * 80}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={`${key}-${entry.nomeCompleto}`}
                        fill={serie.color}
                        fillOpacity={leader?.nomeCompleto === entry.nomeCompleto ? 1 : 0.62}
                      />
                    ))}
                    <LabelList
                      dataKey={key}
                      position="right"
                      offset={7}
                      formatter={formatBarValue}
                      style={{
                        fill: serie.color,
                        fontSize: 10,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/45">
        {METRIC_KEYS.map((key) => (
          <span
            key={key}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5",
              !visibleMetrics[key] && "opacity-35",
            )}
          >
            <span className="size-1.5 rounded-full" style={{ background: SERIES[key].color }} />
            {SERIES[key].label}
          </span>
        ))}
      </div>
    </section>
  );
}

function FiltersTrigger({
  isDefault,
  body,
  activeLabel,
}: {
  isDefault: boolean;
  body: React.ReactNode;
  activeLabel: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      aria-label="Abrir filtros do gráfico de performance"
      className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-border/55 bg-background/70 text-foreground/65 transition hover:border-primary/35 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      {!isDefault && (
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-card" />
      )}
      <span className="sr-only">{activeLabel}</span>
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-3xl p-5">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-base">Filtros do gráfico</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[16rem] rounded-2xl p-4">
        {body}
      </PopoverContent>
    </Popover>
  );
}

function FiltersBody({
  periodo,
  onPeriodoChange,
  visibleMetrics,
  onToggleMetric,
  onReset,
  isDefault,
}: {
  periodo: EquipePeriodo;
  onPeriodoChange: (next: EquipePeriodo) => void;
  visibleMetrics: VisibleMetrics;
  onToggleMetric: (key: MetricKey) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/50">
          Período
        </p>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Período">
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
                  "rounded-xl px-2.5 py-2 text-[11px] font-bold transition",
                  active
                    ? "bg-foreground text-background"
                    : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/50">
          Séries exibidas
        </p>
        <div className="grid gap-1">
          {METRIC_KEYS.map((key) => {
            const active = visibleMetrics[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleMetric(key)}
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-[12px] font-semibold text-foreground/75 transition hover:bg-foreground/5"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: SERIES[key].color, opacity: active ? 1 : 0.3 }}
                  />
                  <span className={cn("truncate", !active && "text-foreground/40")}>
                    {SERIES[key].label}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-md border",
                    active
                      ? "border-transparent bg-foreground text-background"
                      : "border-border/70 text-transparent",
                  )}
                >
                  <Check className="size-3" aria-hidden />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        disabled={isDefault}
        className="rounded-xl px-2 py-2 text-[11px] font-bold text-foreground/55 transition hover:text-primary disabled:opacity-40"
      >
        Restaurar padrão
      </button>
    </div>
  );
}

function SummaryStat({ metric, value }: { metric: MetricKey; value: number }) {
  const serie = SERIES[metric];
  return (
    <div className="min-w-0 px-3 text-center">
      <p className="truncate text-[9.5px] font-black uppercase tracking-[0.14em] text-foreground/45">
        {serie.short}
      </p>
      <p
        className="mt-1 text-xl font-black leading-none tracking-[-0.03em] tabular-nums sm:text-2xl"
        style={{ color: serie.color }}
      >
        {value}
      </p>
    </div>
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

  return (
    <div className="w-[14rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/60 bg-card/95 p-3 text-[11px] text-foreground shadow-[0_24px_54px_-30px_rgba(23,27,33,0.5)] backdrop-blur-xl">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-black leading-tight tracking-[-0.02em]">
          {point.nomeCompleto}
        </p>
        <span className="shrink-0 text-[10px] font-bold text-foreground/45">{periodoLabel}</span>
      </div>

      <div className="space-y-1">
        {METRIC_KEYS.map((key) => (
          <div
            key={key}
            className={cn(
              "flex items-center justify-between gap-3",
              !visibleKeys.includes(key) && "opacity-40",
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-foreground/62">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: SERIES[key].color }}
              />
              <span className="truncate">{SERIES[key].label}</span>
            </span>
            <span className="font-black tabular-nums">{point[key]}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/55 pt-2 text-[10px] font-bold text-foreground/50">
        Conversão
        <span className="text-[12px] font-black tabular-nums text-foreground">
          {point.atendimentos > 0 ? `${point.conversao}%` : "—"}
        </span>
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div
      className="flex h-full flex-col justify-center gap-4 px-2"
      aria-label="Carregando performance da equipe"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3">
          <div className="h-2.5 animate-pulse rounded-full bg-foreground/10" />
          <div className="space-y-1.5">
            <div
              className="h-2 animate-pulse rounded-full bg-foreground/10"
              style={{ width: `${86 - i * 10}%` }}
            />
            <div
              className="h-2 animate-pulse rounded-full bg-foreground/8"
              style={{ width: `${58 - i * 8}%` }}
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
      <div className="grid size-11 place-items-center rounded-2xl border border-border/50 bg-background/60 text-foreground/40">
        <BarChart3 className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-black tracking-[-0.02em] text-foreground/70">
        Sem movimento neste período.
      </p>
    </div>
  );
}

function ErrorChart({ periodoLabel }: { periodoLabel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="grid size-11 place-items-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-black tracking-[-0.02em] text-foreground/70">
        Não foi possível carregar a performance.
      </p>
      <p className="max-w-[20rem] text-[11.5px] leading-relaxed text-foreground/50">
        Os dados de {periodoLabel.toLowerCase()} não responderam agora.
      </p>
    </div>
  );
}

function getVisibleTotal(row: ChartRow, keys: readonly MetricKey[]) {
  return keys.reduce((sum, key) => sum + row[key], 0);
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatBarValue(value: unknown) {
  return typeof value === "number" && value > 0 ? String(value) : "";
}
