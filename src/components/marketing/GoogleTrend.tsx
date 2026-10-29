import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoAxesCombined, Table2, ChevronDown, CircleAlert, Minus } from "lucide-react";
import type {
  GoogleMarketingOverview,
  GoogleMetricTotals,
} from "@/lib/marketing/google-overview.types";
import { GoogleSelect } from "./GoogleAdsPrimitives";
import {
  metrics,
  metricRaw,
  googleMetricLabel,
  googleTrendBuckets,
  googleTodayInZone,
  googleChartDate,
  type Metric,
} from "./google-metrics";

type Bucket = "day" | "week" | "month";
function axisValue(value: number, metric: Metric, currency: string | null) {
  const definition = metrics.find((item) => item.key === metric)!;
  const number = new Intl.NumberFormat("pt-BR", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits:
      metric === "conversions" ? 2 : definition.money || definition.percent ? 1 : 0,
  }).format(value);
  return definition.money
    ? `${currency === "BRL" ? "R$" : (currency ?? "")} ${number}`
    : `${number}${definition.percent ? "%" : ""}`;
}
export function GoogleTrend({
  data,
  scope,
  coverage,
  currency,
  timezone,
}: {
  data: GoogleMarketingOverview["series"];
  scope: GoogleMarketingOverview["scope"];
  coverage: GoogleMarketingOverview["coverage"];
  currency: string | null;
  timezone: string | null;
}) {
  const [first, setFirst] = useState<Metric>("clicks");
  const [second, setSecond] = useState<Metric | "none">("none");
  const [grain, setGrain] = useState<Bucket>("day");
  const [tableOpen, setTableOpen] = useState(false);
  const tableId = useId();
  const firstDef = metrics.find((metric) => metric.key === first)!;
  const secondDef = metrics.find((metric) => metric.key === second);
  const today = googleTodayInZone(timezone);
  const currentDay = Boolean(today && today >= scope.since && today <= scope.until);
  const buckets = useMemo(
    () => googleTrendBuckets(data, scope.since, scope.until, grain),
    [data, scope.since, scope.until, grain],
  );
  const series = useMemo(
    () =>
      buckets?.map((point) => {
        const one = firstDef.money && !currency ? null : metricRaw(first, point.metrics);
        const two =
          second === "none" || (secondDef?.money && !currency)
            ? null
            : metricRaw(second, point.metrics);
        return {
          ...point,
          one: one === null ? null : Number(one),
          two: two === null ? null : Number(two),
        };
      }),
    [buckets, first, second, firstDef.money, secondDef?.money, currency],
  );
  const safe =
    coverage !== "unavailable" &&
    series?.some((point) => point.one !== null || point.two !== null) &&
    series.every((point) =>
      [point.one, point.two].every(
        (value) =>
          value === null || (Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER),
      ),
    );
  const tableAvailable =
    coverage !== "unavailable" &&
    Boolean(
      buckets?.some(
        (point) =>
          metricRaw(first, point.metrics) !== null ||
          (second !== "none" && metricRaw(second, point.metrics) !== null),
      ),
    );
  function includesToday(date: string) {
    if (!today || !currentDay) return false;
    return grain === "day"
      ? date === today
      : grain === "month"
        ? date === today.slice(0, 7)
        : today >= date &&
          Date.parse(`${today}T00:00:00Z`) < Date.parse(`${date}T00:00:00Z`) + 7 * 86400000;
  }
  return (
    <section className="gads-surface gads-trend" aria-label="Evolução Google Ads">
      <header className="gads-trend-header">
        <h2>Evolução</h2>
        <div className="gads-trend-controls">
          <GoogleSelect
            label="Primeira métrica"
            value={first}
            onValueChange={(value) => {
              setFirst(value as Metric);
              if (second === value) setSecond("none");
            }}
            options={metrics.map((metric) => ({ value: metric.key, label: metric.label }))}
            icon={<ChartNoAxesCombined size={16} />}
            className="gads-first-metric"
          />
          <GoogleSelect
            label="Segunda métrica"
            value={second}
            onValueChange={(value) => setSecond(value as Metric | "none")}
            options={[
              { value: "none", label: "Nenhuma" },
              ...metrics
                .filter((metric) => metric.key !== first)
                .map((metric) => ({ value: metric.key, label: metric.label })),
            ]}
            className="gads-second-metric"
          />
          <div className="gads-segment" role="group" aria-label="Agrupar evolução">
            {(
              [
                ["day", "Dia"],
                ["week", "Semana"],
                ["month", "Mês"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={grain === value}
                onClick={() => setGrain(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="gads-trend-meta">
        <div className="gads-legend" aria-label="Séries e escalas do gráfico">
          <span>
            <Minus size={19} strokeWidth={3} aria-hidden="true" />
            {firstDef.label}
            {secondDef && <small>esq.</small>}
          </span>
          {secondDef && (
            <span className="gads-legend-second">
              <Minus size={19} strokeWidth={3} aria-hidden="true" />
              {secondDef.label}
              <small>dir.</small>
            </span>
          )}
        </div>
        {currentDay && (
          <span className="gads-day-note">
            <CircleAlert size={12} aria-hidden="true" />
            Hoje em andamento
          </span>
        )}
      </div>
      <div className="gads-plot">
        {safe && series ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 640, height: 280 }}
          >
            <LineChart
              data={series}
              accessibilityLayer
              margin={{ top: 16, right: secondDef ? 4 : 16, bottom: 0, left: 0 }}
              title="Evolução das métricas Google Ads"
              desc="Use as setas esquerda e direita para consultar cada período. A tabela abaixo contém todos os valores e lacunas."
            >
              <CartesianGrid vertical={false} stroke="var(--gads-grid)" strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tickMargin={12}
                minTickGap={42}
                interval="preserveStartEnd"
                tick={{ fill: "var(--gads-muted)", fontSize: 11 }}
                tickFormatter={(value) => googleChartDate(String(value), grain)}
                height={36}
              />
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tickCount={5}
                tickMargin={10}
                width={firstDef.money ? 68 : 46}
                tick={{ fill: "var(--gads-muted)", fontSize: 11 }}
                tickFormatter={(value) => axisValue(Number(value), first, currency)}
                domain={[0, "auto"]}
                allowDecimals={Boolean(
                  firstDef.money || firstDef.percent || first === "conversions",
                )}
              />
              {secondDef && second !== "none" && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tickCount={5}
                  tickMargin={8}
                  width={secondDef.money ? 68 : 46}
                  tick={{ fill: "var(--gads-second)", fontSize: 11 }}
                  tickFormatter={(value) => axisValue(Number(value), second, currency)}
                  domain={[0, "auto"]}
                  allowDecimals={Boolean(
                    secondDef.money || secondDef.percent || second === "conversions",
                  )}
                />
              )}
              <Tooltip
                cursor={{ stroke: "var(--gads-guide)", strokeWidth: 1, strokeDasharray: "3 3" }}
                allowEscapeViewBox={{ x: false, y: false }}
                offset={12}
                isAnimationActive={false}
                filterNull={false}
                wrapperStyle={{ outline: "none", zIndex: 5, maxWidth: "calc(100% - 16px)" }}
                content={({ active, payload, label }) => {
                  const point = payload?.[0]?.payload as
                    | { metrics?: GoogleMetricTotals; date?: string }
                    | undefined;
                  return active && point?.metrics ? (
                    <div className="gads-chart-tooltip">
                      <p>{googleChartDate(String(label), grain, true)}</p>
                      <dl>
                        <div>
                          <dt>
                            <Minus size={14} aria-hidden="true" />
                            {firstDef.label}
                          </dt>
                          <dd>{googleMetricLabel(first, point.metrics, currency, coverage)}</dd>
                        </div>
                        {secondDef && second !== "none" && (
                          <div className="gads-tooltip-second">
                            <dt>
                              <Minus size={14} aria-hidden="true" />
                              {secondDef.label}
                            </dt>
                            <dd>{googleMetricLabel(second, point.metrics, currency, coverage)}</dd>
                          </div>
                        )}
                      </dl>
                      {includesToday(String(label)) && (
                        <small>Dia em andamento · valores parciais</small>
                      )}
                      {metricRaw(first, point.metrics) === null && (
                        <small>Sem coleta completa para este período</small>
                      )}
                    </div>
                  ) : null;
                }}
              />
              <Line
                yAxisId="left"
                type="linear"
                dataKey="one"
                name={firstDef.label}
                stroke="var(--gads-line)"
                strokeWidth={2.4}
                dot={{ r: 2, strokeWidth: 0, fill: "var(--gads-line)" }}
                activeDot={{ r: 5, stroke: "var(--gads-surface)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {secondDef && (
                <Line
                  yAxisId="right"
                  type="linear"
                  dataKey="two"
                  name={secondDef.label}
                  stroke="var(--gads-second)"
                  strokeWidth={2.2}
                  strokeDasharray="5 4"
                  dot={{ r: 2, strokeWidth: 0, fill: "var(--gads-second)" }}
                  activeDot={{ r: 5, stroke: "var(--gads-surface)", strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="gads-chart-empty">
            <ChartNoAxesCombined size={26} strokeWidth={1.4} aria-hidden="true" />
            <p>
              Evolução indisponível para {grain === "day" ? "o escopo" : "o agrupamento"}{" "}
              selecionado.
            </p>
            <span>
              {coverage === "unavailable"
                ? "Não há coleta comprovada neste período."
                : grain !== "day"
                  ? "Há lacunas na coleta. Consulte os valores por dia."
                  : "Consulte os valores disponíveis na tabela."}
            </span>
          </div>
        )}
      </div>
      <footer className="gads-chart-footer">
        <span className="gads-keyboard-hint">Use ← → no gráfico para consultar os valores</span>
        <button
          type="button"
          className="gads-text-button"
          aria-expanded={tableOpen}
          aria-controls={tableId}
          onClick={() => setTableOpen(!tableOpen)}
          disabled={!tableAvailable}
        >
          <Table2 size={15} aria-hidden="true" />
          Ver tabela
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={tableOpen ? "gads-chevron-open" : ""}
          />
        </button>
      </footer>
      {tableOpen && (
        <div
          id={tableId}
          className="gads-trend-table-scroll"
          role="region"
          aria-label="Valores da evolução"
          tabIndex={0}
        >
          <table className="gads-trend-table">
            <caption className="sr-only">
              Valores da evolução. Traço indica valor indisponível. O dia atual está em andamento.
            </caption>
            <thead>
              <tr>
                <th scope="col">Período</th>
                <th scope="col">{firstDef.label}</th>
                {secondDef && <th scope="col">{secondDef.label}</th>}
              </tr>
            </thead>
            <tbody>
              {buckets?.map((point) => (
                <tr key={point.date}>
                  <th scope="row">
                    {googleChartDate(point.date, grain, true)}
                    {includesToday(point.date) && <span> · Em andamento</span>}
                  </th>
                  <td>{googleMetricLabel(first, point.metrics, currency, coverage)}</td>
                  {secondDef && second !== "none" && (
                    <td>{googleMetricLabel(second, point.metrics, currency, coverage)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
