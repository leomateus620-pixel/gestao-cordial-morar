import { useMemo, useRef, useState } from "react";
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
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Ellipsis,
  Facebook,
  Globe2,
  Info,
  Lightbulb,
  Megaphone,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import type { AdConnectionPublic } from "@/lib/ads/ads.functions";
import type { AdPlatform } from "@/lib/ads/types";
import { axisTick, chartCordial, chartAccent, chartSystem } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import type {
  CampaignPeriodStats,
  ComparedTrendPoint,
  DateRange,
  Insight,
  PeriodKpis,
  TrendPoint,
} from "@/services/marketing-insights";
import { compareDailyTrends, delta } from "@/services/marketing-insights";
const PLATFORM_LABEL = { meta: "Meta Ads", google: "Google Ads" };
export function PlatformMark({
  platform,
  className,
}: {
  platform?: AdPlatform | null;
  className?: string;
}) {
  const Icon = platform === "meta" ? Facebook : platform === "google" ? Globe2 : Megaphone;
  return (
    <span
      title={platform ? PLATFORM_LABEL[platform] : "Campanha manual"}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg",
        platform === "google" ? "bg-emerald-500/10 text-emerald-800" : "bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}
export function ConnectionsStrip({
  connections,
  loading,
}: {
  connections: AdConnectionPublic[];
  loading: boolean;
  onConnect?: (p: AdPlatform) => void;
}) {
  if (!loading && connections.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-foreground/65"
      aria-live="polite"
    >
      {loading
        ? "Consultando conexões…"
        : connections.map((c, i) => (
            <span
              key={c.id ?? `${c.platform}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2 ring-1 ring-border/60"
            >
              <PlatformMark platform={c.platform} className="size-5" />
              {PLATFORM_LABEL[c.platform]}
              {c.imobiliaria ? ` · ${c.imobiliaria}` : ""}
              <span
                className={c.status === "connected" ? "text-emerald-800" : "text-foreground/65"}
              >
                {c.status === "connected" ? (
                  <>
                    <CheckCircle2 className="mr-1 inline size-3" />
                    Credencial vinculada
                  </>
                ) : c.status === "expired" ? (
                  "Token expirado"
                ) : c.status === "error" ? (
                  "Requer atenção"
                ) : (
                  "Não configurado"
                )}
              </span>
            </span>
          ))}
    </div>
  );
}
const compact = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: v >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(v);
const amount = (v: number | null, currency = "BRL") =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency });
type MetricKey =
  | "spend"
  | "leads"
  | "cpl"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach"
  | "frequency"
  | "impressions"
  | "clicks"
  | "activeCampaigns";
type Def = {
  key: MetricKey;
  label: string;
  help: string;
  money?: boolean;
  percent?: boolean;
  lower?: boolean;
};
export function KpiGrid({
  curr,
  prev,
  showFinancial,
  scopeLabel = "Filtro completo",
  showScopeLabel = false,
}: {
  curr: PeriodKpis;
  prev: PeriodKpis;
  showFinancial: boolean;
  scopeLabel?: string;
  showScopeLabel?: boolean;
}) {
  const primary: Def[] = showFinancial
    ? [
        {
          key: "spend",
          label: "Investimento",
          help: "Gasto reportado no período, na moeda da conta. O aumento do gasto depende do contexto.",
          money: true,
        },
        {
          key: "leads",
          label: "Leads reportados",
          help: "Contagem da plataforma. Submissões recebidas e atendimentos únicos são contagens distintas.",
        },
        {
          key: "cpl",
          label: "CPL",
          help: "Investimento dividido pelos leads reportados. Uma redução indica menor custo por lead.",
          money: true,
          lower: true,
        },
        {
          key: "activeCampaigns",
          label: "Campanhas ativas",
          help: "Status atual das campanhas no conjunto selecionado; não é uma contagem histórica.",
        },
      ]
    : [
        {
          key: "leads",
          label: "Leads reportados",
          help: "Contagem da plataforma. Submissões recebidas e atendimentos únicos são contagens distintas.",
        },
        {
          key: "activeCampaigns",
          label: "Campanhas ativas",
          help: "Status atual das campanhas no conjunto selecionado.",
        },
        {
          key: "clicks",
          label: "Cliques",
          help: "Cliques reportados; não são visitas à página de destino.",
        },
        { key: "impressions", label: "Impressões", help: "Quantidade de exibições dos anúncios." },
      ];
  const secondary: Def[] = [
    {
      key: "reach",
      label: "Alcance no período",
      help: "Exige um agregado da API no mesmo período. Alcances diários e de campanhas não são somados.",
    },
    {
      key: "frequency",
      label: "Frequência",
      help: "Exibições por pessoa no mesmo agregado de alcance.",
    },
    ...(showFinancial
      ? ([
          { key: "impressions", label: "Impressões", help: "Quantidade de exibições." },
          { key: "clicks", label: "Cliques", help: "Cliques reportados, sem presumir visitas." },
        ] as Def[])
      : []),
    { key: "ctr", label: "CTR", help: "Cliques divididos por impressões × 100.", percent: true },
    ...(showFinancial
      ? ([
          { key: "cpc", label: "CPC", help: "Investimento dividido pelos cliques.", money: true },
          {
            key: "cpm",
            label: "CPM",
            help: "Investimento dividido pelas impressões × 1.000.",
            money: true,
          },
        ] as Def[])
      : []),
  ];
  function value(def: Def) {
    const v = curr[def.key];
    return (curr.hasData === false && def.key !== "activeCampaigns") || v === null
      ? "—"
      : def.money
        ? amount(v, curr.currency ?? "BRL")
        : def.percent
          ? `${v.toFixed(2)}%`
          : def.key === "frequency"
            ? v.toFixed(2)
            : compact(v);
  }
  function mobileValue(def: Def) {
    const v = curr[def.key];
    return def.money && v !== null && Math.abs(v) >= 10_000 && curr.hasData !== false
      ? v.toLocaleString("pt-BR", {
          style: "currency",
          currency: curr.currency ?? "BRL",
          notation: "compact",
          maximumFractionDigits: 1,
        })
      : value(def);
  }
  const icons = showFinancial
    ? [Wallet, Users, Target, Megaphone]
    : [Users, Megaphone, Target, Globe2];
  return (
    <section aria-label={`Resultados do período · ${scopeLabel}`} className="space-y-2">
      {showScopeLabel && <p className="text-xs font-medium text-foreground/70">{scopeLabel}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {primary.map((def, index) => {
          const d =
            def.key === "activeCampaigns" ||
            curr.hasData === false ||
            prev.hasData === false ||
            (def.money && curr.currency !== prev.currency)
              ? null
              : delta(curr[def.key], prev[def.key]);
          const Icon = icons[index];
          return (
            <article
              key={def.key}
              className="relative flex min-w-0 items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-border/60 sm:p-4"
            >
              <span
                className={cn(
                  "hidden size-11 shrink-0 place-items-center rounded-full sm:grid",
                  index < 2 ? "bg-primary/10 text-primary" : "bg-orange-500/10 text-orange-800",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <p className="text-xs text-foreground/70 sm:text-[13px]">{def.label}</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="grid size-7 shrink-0 place-items-center rounded-md text-foreground/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={
                          index === primary.length - 1
                            ? "Mais indicadores e definições"
                            : `Definição de ${def.label}`
                        }
                      >
                        <Info className="size-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="max-h-[70vh] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl text-sm"
                    >
                      <p className="font-semibold">{def.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/75">{def.help}</p>
                      <p className="mt-2 text-xs text-foreground/65">Escopo: {scopeLabel}.</p>
                      {index === primary.length - 1 && (
                        <>
                          <h3 className="mt-4 font-semibold">Mais indicadores</h3>
                          <dl className="mt-3 space-y-3">
                            {secondary.map((metric) => (
                              <div key={metric.key}>
                                <div className="flex justify-between gap-3">
                                  <dt className="text-xs font-medium">{metric.label}</dt>
                                  <dd className="text-sm font-semibold tabular-nums">
                                    {value(metric)}
                                  </dd>
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-foreground/70">
                                  {metric.help}
                                </p>
                              </div>
                            ))}
                          </dl>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <p
                  title={value(def)}
                  className="font-display text-[clamp(1.125rem,4vw,1.5rem)] font-semibold tabular-nums tracking-tight sm:text-2xl"
                >
                  <span className="sm:hidden">{mobileValue(def)}</span>
                  <span className="hidden sm:inline">{value(def)}</span>
                </p>
                {d !== null && (
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1 text-[11px] tabular-nums",
                      def.lower && d < 0 ? "text-emerald-800" : "text-foreground/65",
                    )}
                  >
                    {d >= 0 ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {d > 0 ? "+" : ""}
                    {d.toLocaleString("pt-BR")}%{" "}
                    <span className="sr-only">no período equivalente</span>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {curr.mixedCurrencies && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          Selecione uma conta para consultar valores financeiros na mesma moeda.
        </p>
      )}
    </section>
  );
}
export function InsightsBlock({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <section
      aria-label="Leitura do período · página atual"
      className="flex min-w-0 items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3"
    >
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-foreground/85">{insights[0].text}</p>
      </div>
      {insights.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Mais leituras da página atual"
            >
              <Ellipsis className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 max-w-[calc(100vw-24px)] rounded-xl">
            <h3 className="text-sm font-semibold">Leituras da página atual</h3>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/80">
              {insights.slice(1).map((insight) => (
                <li key={insight.text}>{insight.text}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </section>
  );
}
type ChartMetric = "leads" | "clicks" | "spend" | "cpl";
const chartLabels: Record<ChartMetric, string> = {
  leads: "Leads reportados",
  clicks: "Cliques",
  spend: "Investimento",
  cpl: "CPL",
};
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
const exactDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
function TrendTooltip({
  active,
  payload,
  metric,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ComparedTrendPoint }>;
  metric: ChartMetric;
  currency: string | null;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const financial = metric === "spend" || metric === "cpl";
  const format = (value: number | null | undefined) =>
    value == null
      ? "Sem dado"
      : financial
        ? currency
          ? amount(value, currency)
          : "Moeda indisponível"
        : `${value.toLocaleString("pt-BR")} ${metric === "leads" ? "leads" : "cliques"}`;
  const current = point.current?.[metric],
    previous = point.previous?.[metric];
  const change = delta(current ?? null, previous ?? null);
  return (
    <div className="w-72 max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-primary/20 bg-popover text-popover-foreground shadow-xl shadow-primary/15">
      <div className="border-b border-primary/10 px-3.5 py-3">
        <p className="font-display text-sm font-semibold">{chartLabels[metric]}</p>
        <p className="mt-0.5 text-xs text-foreground/65">Mesmo dia relativo de cada período</p>
      </div>
      <div className="space-y-2 p-3">
        <div
          className="rounded-lg border-l-[3px] bg-[#edf5fa] px-3 py-2"
          style={{ borderLeftColor: chartCordial }}
        >
          <p className="text-xs text-foreground/70">
            Atual · {point.currentDate ? exactDate(point.currentDate) : "fora do período"}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: chartSystem }}>
            {format(current)}
          </p>
        </div>
        <div
          className="rounded-lg border-l-[3px] bg-[#fdf2e9] px-3 py-2"
          style={{ borderLeftColor: chartAccent }}
        >
          <p className="text-xs text-foreground/70">
            Anterior · {point.previousDate ? exactDate(point.previousDate) : "fora do período"}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {format(previous)}
          </p>
        </div>
        {change !== null && (
          <p className="flex items-center gap-1.5 px-1 pt-1 text-xs text-foreground/75">
            {change >= 0 ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            <span className="font-semibold tabular-nums">
              {change > 0 ? "+" : ""}
              {change.toLocaleString("pt-BR")}%
            </span>{" "}
            em relação ao dia equivalente
          </p>
        )}
      </div>
    </div>
  );
}
export function TrendChart({
  data,
  previousData = [],
  ranges,
  showFinancial = false,
  currency = null,
  campaignCount,
}: {
  data: TrendPoint[];
  previousData?: TrendPoint[];
  ranges?: { current: DateRange; previous: DateRange };
  showFinancial?: boolean;
  currency?: string | null;
  campaignCount?: number;
}) {
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>("leads");
  const metric =
    (!showFinancial || !currency) && (selectedMetric === "spend" || selectedMetric === "cpl")
      ? "leads"
      : selectedMetric;
  const financial = metric === "spend" || metric === "cpl";
  const fallbackRanges = useMemo(
    () => ({
      current: { since: data[0]?.date ?? "1970-01-01", until: data.at(-1)?.date ?? "1970-01-01" },
      previous: {
        since: previousData[0]?.date ?? "1970-01-01",
        until: previousData.at(-1)?.date ?? "1970-01-01",
      },
    }),
    [data, previousData],
  );
  const aligned = useMemo(
    () => compareDailyTrends(data, previousData, ranges ?? fallbackRanges),
    [data, previousData, ranges, fallbackRanges],
  );
  const currentDays = aligned.filter((point) => point.currentDate);
  const daysWithData = currentDays.filter(
    (point) => point.current && (!financial || point.current.spend !== null),
  );
  const summary = useMemo(() => {
    const points = aligned.filter((point) => point.currentDate).map((point) => point.current);
    const observed = points.filter((point): point is TrendPoint => point !== null);
    if (!observed.length) return null;
    if (metric === "leads" || metric === "clicks")
      return observed.reduce((sum, point) => sum + point[metric], 0);
    if (
      !currency ||
      observed.length !== points.length ||
      observed.some((point) => point.spend === null)
    )
      return null;
    const spend = observed.reduce((sum, point) => sum + point.spend!, 0);
    if (metric === "spend") return spend;
    const leads = observed.reduce((sum, point) => sum + point.leads, 0);
    return leads > 0 ? spend / leads : null;
  }, [aligned, metric, currency]);
  const hasCurrent = aligned.some((point) => point.current?.[metric] != null);
  const hasPrevious = aligned.some((point) => point.previous?.[metric] != null);
  const actualRanges = ranges ?? fallbackRanges;
  const periodLabel = (range: DateRange) => `${shortDate(range.since)}–${shortDate(range.until)}`;
  const summaryLabel =
    summary === null
      ? "—"
      : financial
        ? amount(summary, currency!)
        : summary.toLocaleString("pt-BR");
  const incomplete = daysWithData.length < currentDays.length;
  const axisValue = (value: number) =>
    financial && currency
      ? value.toLocaleString("pt-BR", {
          style: "currency",
          currency,
          notation: "compact",
          maximumFractionDigits: 0,
        })
      : compact(value);
  return (
    <section
      aria-label="Evolução dos resultados da página atual"
      className="min-w-0 overflow-hidden rounded-2xl border border-primary/15 bg-[#eef5f7] p-4 shadow-sm shadow-primary/5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight text-primary">
            Evolução dos resultados
          </h2>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary/15 bg-white px-2 text-[11px] font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Escopo do gráfico: página atual"
              >
                Nesta página{campaignCount !== undefined ? ` · ${campaignCount}` : ""}
                <Info className="size-3" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-[calc(100vw-24px)] rounded-xl text-xs leading-relaxed">
              Série e destaque calculados somente a partir dos dias com dados das campanhas desta
              página. Lacunas permanecem sem valor. O investimento e o CPL do destaque exigem a base
              diária completa. Os indicadores acima podem abranger todo o filtro.
            </PopoverContent>
          </Popover>
        </div>
        <Select value={metric} onValueChange={(value) => setSelectedMetric(value as ChartMetric)}>
          <SelectTrigger
            className="h-10 w-auto min-w-44 rounded-lg border-primary/20 bg-white font-medium text-primary sm:h-9"
            aria-label="Métrica do gráfico"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(chartLabels)
              .filter(([key]) => (showFinancial && currency) || !["spend", "cpl"].includes(key))
              .map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <strong
            data-marketing-chart-summary
            className="font-display text-[28px] font-semibold leading-tight tabular-nums tracking-tight text-primary sm:text-[30px]"
          >
            {summaryLabel}
          </strong>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground/80">
              {chartLabels[metric]} · nesta página
            </p>
            <p className="mt-0.5 text-[11px] text-foreground/65">
              {incomplete
                ? `${daysWithData.length} de ${currentDays.length} dias com dados`
                : `${currentDays.length} dias com dados`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Legenda dos períodos">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-white px-2.5 py-1 text-foreground/80">
            <span
              className="h-0.5 w-4"
              style={{ backgroundColor: chartCordial }}
              aria-hidden="true"
            />
            Atual · {periodLabel(actualRanges.current)}
          </span>
          {hasPrevious ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-[#fff5ed] px-2.5 py-1 text-foreground/80">
              <span
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: chartAccent }}
                aria-hidden="true"
              />
              Anterior · {periodLabel(actualRanges.previous)}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-primary/10 bg-white/70 px-2.5 py-1 text-foreground/65">
              Comparação indisponível
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 h-52 min-w-0 rounded-xl border border-primary/10 bg-[#fcfefe] pt-2 sm:h-56">
        {!hasCurrent && !hasPrevious ? (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-foreground/65">
            {metric === "cpl" && data.length
              ? "Sem base diária para calcular CPL neste período."
              : "Sem métricas diárias neste período."}
          </div>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 300, height: 208 }}
          >
            <AreaChart
              accessibilityLayer
              data={aligned}
              margin={{ top: 8, right: 14, left: financial ? 0 : -12, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(30,100,125,0.10)"
                strokeDasharray="3 5"
                vertical
                horizontal
              />
              <XAxis
                dataKey="label"
                tick={{ ...axisTick, fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                tickMargin={8}
              />
              <YAxis
                tick={{ ...axisTick, fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={financial}
                tickFormatter={axisValue}
                width={financial ? 68 : 44}
              />
              <Tooltip
                content={<TrendTooltip metric={metric} currency={currency} />}
                cursor={{ stroke: chartSystem, strokeOpacity: 0.3, strokeDasharray: "3 4" }}
              />
              <Area
                type="linear"
                dataKey={(point: ComparedTrendPoint) => point.current?.[metric] ?? null}
                name="Atual"
                stroke={chartCordial}
                fill={chartCordial}
                fillOpacity={0.1}
                strokeWidth={2.8}
                connectNulls={false}
                isAnimationActive={false}
                dot={{
                  r: aligned.length > 60 ? 1.5 : 3,
                  fill: chartCordial,
                  stroke: "#fff",
                  strokeWidth: 1.5,
                }}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              />
              {hasPrevious && (
                <Area
                  type="linear"
                  dataKey={(point: ComparedTrendPoint) => point.previous?.[metric] ?? null}
                  name="Anterior"
                  stroke={chartAccent}
                  fill="transparent"
                  strokeWidth={2.2}
                  strokeDasharray="5 4"
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{
                    r: aligned.length > 60 ? 1.5 : 2.5,
                    fill: chartAccent,
                    stroke: "#fff",
                    strokeWidth: 1.5,
                  }}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
function SyncState({ stat, detailed = false }: { stat: CampaignPeriodStats; detailed?: boolean }) {
  const c = stat.campaign;
  if (c.syncStatus === "error")
    return (
      <span className="inline-flex items-center gap-1 text-red-800">
        <AlertTriangle className="size-3" />
        Falha na sincronização{detailed && c.syncError ? `: ${c.syncError}` : ""}
      </span>
    );
  if (c.syncStatus === "partial")
    return (
      <span className="inline-flex items-center gap-1 text-amber-900">
        <AlertTriangle className="size-3" />
        Dados parciais
      </span>
    );
  if (c.syncStatus === "queued" || c.syncStatus === "syncing")
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Clock3 className="size-3" />
        {c.syncStatus === "queued" ? "Na fila" : "Sincronizando"}
      </span>
    );
  if (!c.platform) return detailed ? <span>Registro manual</span> : null;
  if (!c.lastSyncedAt) return <span className="text-foreground/65">Aguardando dados</span>;
  const stale = Date.now() - new Date(c.lastSyncedAt).getTime() > 48 * 60 * 60 * 1000;
  return stale || detailed ? (
    <span className={stale ? "text-amber-900" : "text-foreground/65"}>
      {stale ? "Desatualizado" : "Última sincronização"}
      {detailed
        ? ` · ${new Date(c.lastSyncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
        : ""}
    </span>
  ) : null;
}
function CampaignActions({
  stat,
  syncingId,
  onSync,
  onOpen,
}: {
  stat: CampaignPeriodStats;
  syncingId: string | null;
  onSync?: (id: string) => void;
  onOpen: (id: string, trigger?: HTMLElement) => void;
}) {
  const c = stat.campaign;
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-11 shrink-0 rounded-lg sm:size-9"
          aria-label={`Ações e sincronização de ${c.name}`}
          ref={triggerRef}
        >
          <Ellipsis className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-24px)] rounded-xl">
        <p className="break-words text-sm font-semibold">{c.name}</p>
        <p className="mt-2 text-xs capitalize text-foreground/70">
          {c.imobiliaria} · {c.platform ? PLATFORM_LABEL[c.platform] : c.channel}
        </p>
        <div className="mt-2 text-xs">
          <SyncState stat={stat} detailed />
        </div>
        <Button
          variant="outline"
          className="mt-3 h-10 w-full justify-start"
          onClick={(event) => onOpen(c.id, triggerRef.current ?? event.currentTarget)}
        >
          Abrir ficha da campanha
        </Button>
        {c.externalCampaignId && onSync && (
          <Button
            variant="ghost"
            className="mt-1 h-10 w-full justify-start"
            disabled={syncingId === c.id || ["queued", "syncing"].includes(c.syncStatus ?? "")}
            onClick={() => onSync(c.id)}
          >
            <RefreshCw
              className={cn(
                "size-4",
                syncingId === c.id && "animate-spin motion-reduce:animate-none",
              )}
            />
            Solicitar sincronização
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
export function CampaignTable({
  stats,
  showFinancial,
  syncingId,
  onOpen,
  onSync,
}: {
  stats: CampaignPeriodStats[];
  showFinancial: boolean;
  syncingId: string | null;
  onOpen: (id: string, trigger?: HTMLElement) => void;
  onSync?: (id: string) => void;
}) {
  return (
    <section
      className="min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-border/60"
      aria-label="Campanhas"
    >
      <div className="divide-y md:hidden">
        {stats.map((s) => (
          <article key={s.campaign.id} className="p-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <PlatformMark platform={s.campaign.platform} />
              <button
                type="button"
                title={s.campaign.name}
                onClick={(event) => onOpen(s.campaign.id, event.currentTarget)}
                className="min-h-11 min-w-0 flex-1 rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">
                  {s.campaign.name}
                </span>
                <span className="sr-only">
                  {" "}
                  · {s.campaign.platform ? PLATFORM_LABEL[s.campaign.platform] : s.campaign.channel}
                </span>
              </button>
              <CampaignActions stat={s} syncingId={syncingId} onSync={onSync} onOpen={onOpen} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <CampaignStatusBadge status={s.campaign.status} />
              <span className="text-[11px]">
                <SyncState stat={s} />
              </span>
            </div>
            <dl
              className={cn(
                "mt-3 grid gap-2 text-xs tabular-nums",
                showFinancial ? "grid-cols-3" : "grid-cols-1",
              )}
            >
              <div>
                <dt className="text-foreground/65">Leads</dt>
                <dd className="mt-1 font-semibold">
                  {s.hasData ? s.leads.toLocaleString("pt-BR") : "—"}
                </dd>
              </div>
              {showFinancial && (
                <>
                  <div>
                    <dt className="text-foreground/65">Investimento</dt>
                    <dd className="mt-1 font-semibold">{amount(s.spend, s.currency ?? "BRL")}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/65">CPL</dt>
                    <dd className="mt-1 font-semibold">{amount(s.cpl, s.currency ?? "BRL")}</dd>
                  </div>
                </>
              )}
            </dl>
          </article>
        ))}
      </div>
      <div
        className="hidden overflow-x-auto md:block"
        tabIndex={0}
        role="region"
        aria-label="Tabela de resultados de campanhas"
      >
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-left text-xs font-medium text-foreground/75">
              <th className={cn("px-4 py-3", showFinancial ? "w-[42%]" : "w-[60%]")}>Campanha</th>
              <th className="w-28 px-3 py-3">Status</th>
              <th className="w-20 px-3 py-3 text-right">Leads</th>
              {showFinancial && (
                <>
                  <th className="w-32 px-3 py-3 text-right">Investimento</th>
                  <th className="w-28 px-3 py-3 text-right">CPL</th>
                </>
              )}
              <th className="w-12 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.campaign.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PlatformMark platform={s.campaign.platform} />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        title={s.campaign.name}
                        className="block min-h-9 w-full rounded py-1 text-left text-[13px] font-medium leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={(event) => onOpen(s.campaign.id, event.currentTarget)}
                      >
                        <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">
                          {s.campaign.name}
                        </span>
                        <span className="sr-only">
                          {" "}
                          ·{" "}
                          {s.campaign.platform
                            ? PLATFORM_LABEL[s.campaign.platform]
                            : s.campaign.channel}
                        </span>
                      </button>
                      <div className="text-[11px]">
                        <SyncState stat={s} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <CampaignStatusBadge status={s.campaign.status} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.hasData ? s.leads.toLocaleString("pt-BR") : "—"}
                </td>
                {showFinancial && (
                  <>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {amount(s.spend, s.currency ?? "BRL")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {amount(s.cpl, s.currency ?? "BRL")}
                    </td>
                  </>
                )}
                <td className="py-2 pr-2 text-right">
                  <CampaignActions stat={s} syncingId={syncingId} onSync={onSync} onOpen={onOpen} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
