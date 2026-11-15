import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeDollarSign,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Handshake,
  Home,
  RotateCcw,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import {
  defaultDashboardPeriods,
  isValidMetricMonth,
  validateMetricDates,
  type DashboardMetric,
  type DashboardPeriods,
  type MetricBucket,
  type MetricId,
  type MetricPeriod,
} from "@/lib/dashboard/metrics";
import "./dashboard-metrics.css";

type CardDef = {
  id: MetricId;
  label: string;
  icon: LucideIcon;
  accent: string;
  to: "/atendimentos" | "/agenda";
  search?: { track: "aluguel" | "venda" };
};
const cards: CardDef[] = [
  {
    id: "atendimentos",
    label: "Atendimentos",
    icon: TrendingUp,
    accent: "teal",
    to: "/atendimentos",
  },
  {
    id: "clientes",
    label: "Novos clientes",
    icon: Handshake,
    accent: "emerald",
    to: "/atendimentos",
  },
  {
    id: "aluguel",
    label: "Buscando aluguel",
    icon: Home,
    accent: "amber",
    to: "/atendimentos",
    search: { track: "aluguel" },
  },
  {
    id: "compra",
    label: "Buscando compra",
    icon: BadgeDollarSign,
    accent: "violet",
    to: "/atendimentos",
    search: { track: "venda" },
  },
  { id: "visitas", label: "Visitas agendadas", icon: CalendarCheck, accent: "sky", to: "/agenda" },
];
const presets: { period: MetricPeriod; label: string }[] = [
  { period: { kind: "today" }, label: "Hoje" },
  { period: { kind: "7d" }, label: "7 dias" },
  { period: { kind: "30d" }, label: "30 dias" },
  { period: { kind: "month" }, label: "Este mês" },
  { period: { kind: "previous-month" }, label: "Mês anterior" },
  { period: { kind: "year" }, label: "Este ano" },
];

function PeriodPicker({
  card,
  metric,
  period,
  onChange,
}: {
  card: CardDef;
  metric: DashboardMetric;
  period: MetricPeriod;
  onChange: (period: MetricPeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"month" | "range">("month");
  const [month, setMonth] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const Icon = card.icon;
  const id = `metric-period-${card.id}`;
  const choices = [
    ...presets,
    { period: { kind: "all" } as MetricPeriod, label: "Todo o período" },
  ];
  if (card.id === "visitas")
    choices.push({ period: { kind: "upcoming" }, label: "A partir de hoje" });

  function apply(next: MetricPeriod) {
    onChange(next);
    setOpen(false);
  }
  function changeOpen(next: boolean) {
    if (next) {
      setMode(period.kind === "custom" ? "range" : "month");
      setMonth(period.kind === "selected-month" ? period.month : "");
      setStart(period.kind === "custom" ? period.start : "");
      setEnd(period.kind === "custom" ? period.end : "");
      setError(null);
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="metric-period-trigger"
          aria-label={`Alterar período de ${card.label}: ${metric.periodLabel}`}
          title="Personalizar período"
        >
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
          <ChevronDown size={11} className="metric-period-chevron" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="metric-period-popover"
        aria-labelledby={`${id}-title`}
      >
        <div className="metric-picker-heading">
          <h3 id={`${id}-title`}>{card.label}</h3>
          <button
            type="button"
            className="metric-close"
            onClick={() => setOpen(false)}
            aria-label="Fechar filtro de período"
          >
            <X size={17} />
          </button>
        </div>
        <div className="metric-presets" aria-label="Períodos rápidos">
          {choices.map((choice) => (
            <button
              key={choice.period.kind}
              type="button"
              aria-pressed={period.kind === choice.period.kind}
              onClick={() => apply(choice.period)}
            >
              {choice.label}
              {period.kind === choice.period.kind && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <fieldset className="metric-mode">
          <legend className="sr-only">Tipo de período personalizado</legend>
          <label>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === "month"}
              onChange={() => {
                setMode("month");
                setError(null);
              }}
            />
            Escolher mês
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === "range"}
              onChange={() => {
                setMode("range");
                setError(null);
              }}
            />
            Intervalo de datas
          </label>
        </fieldset>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const message =
              mode === "month"
                ? isValidMetricMonth(month)
                  ? null
                  : "Escolha um mês válido."
                : validateMetricDates(start, end);
            setError(message);
            if (!message)
              apply(
                mode === "month"
                  ? { kind: "selected-month", month }
                  : { kind: "custom", start, end },
              );
          }}
        >
          {mode === "month" ? (
            <label className="metric-field">
              Mês e ano
              <input
                type="month"
                required
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </label>
          ) : (
            <div className="metric-date-fields">
              <label className="metric-field">
                Data inicial
                <input
                  type="date"
                  required
                  value={start}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setError(null);
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
              </label>
              <label className="metric-field">
                Data final
                <input
                  type="date"
                  required
                  min={start || undefined}
                  value={end}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setError(null);
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
              </label>
            </div>
          )}
          {error && (
            <p id={`${id}-error`} className="metric-date-error" role="alert">
              {error}
            </p>
          )}
          <div className="metric-picker-actions">
            <button
              type="button"
              className="metric-reset"
              onClick={() => apply(defaultDashboardPeriods[card.id])}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Restaurar
            </button>
            <button type="submit" className="metric-apply">
              Aplicar período
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function MetricChart({ metric, label }: { metric: DashboardMetric; label: string }) {
  const dated = metric.value - metric.undated;
  return (
    <div className="metric-chart-section">
      <div className="metric-chart-caption">
        <span>{metric.chartLabel}</span>
        <span className="metric-chart-dot" aria-hidden="true" />
      </div>
      {dated === 0 ? (
        <div className="metric-chart-empty">
          <span>
            {metric.undated ? "Registros sem data de cadastro" : "Nenhum registro no período"}
          </span>
        </div>
      ) : (
        <div
          className="metric-chart"
          role="group"
          aria-label={`${label}: ${metric.chartLabel.toLowerCase()}. Use as setas para explorar as barras.`}
        >
          <ResponsiveContainer width="100%" height={72} minWidth={0}>
            <BarChart
              data={metric.buckets}
              margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
              barCategoryGap="22%"
              accessibilityLayer
            >
              <XAxis dataKey="label" hide />
              <Tooltip
                cursor={{ fill: "var(--metric-tint)" }}
                allowEscapeViewBox={{ x: false, y: true }}
                content={({ active, payload }) => {
                  const bucket = payload?.[0]?.payload as MetricBucket | undefined;
                  return active && bucket ? (
                    <div className="metric-chart-tooltip">
                      <span>{bucket.label}</span>
                      <strong>
                        {bucket.value.toLocaleString("pt-BR")}{" "}
                        {bucket.value === 1 ? "registro" : "registros"}
                      </strong>
                    </div>
                  ) : null;
                }}
              />
              <Bar
                dataKey="value"
                name="Registros"
                fill="var(--metric-color)"
                fillOpacity={0.78}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="sr-only">
            <table>
              <caption>
                {label} — {metric.chartLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Registros</th>
                </tr>
              </thead>
              <tbody>
                {metric.buckets.map((bucket) => (
                  <tr key={bucket.label}>
                    <th scope="row">{bucket.label}</th>
                    <td>{bucket.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="metric-chart-axis" aria-hidden="true">
        <span>{metric.startLabel}</span>
        <span>{metric.endLabel}</span>
      </div>
      {metric.undated > 0 && (
        <p className="metric-undated">{metric.undated} sem data, fora do gráfico</p>
      )}
    </div>
  );
}

export function DashboardMetricCards() {
  const [periods, setPeriods] = useState<DashboardPeriods>(defaultDashboardPeriods);
  const metrics = useDashboardMetrics(periods);
  return (
    <section className="dashboard-metrics" aria-label="Indicadores do painel">
      <div className="dashboard-metrics-grid">
        {cards.map((card) => {
          const metric = metrics.cards[card.id];
          const state = card.id === "visitas" ? metrics.agendaState : metrics.attendanceState;
          return (
            <article
              key={card.id}
              className="dashboard-metric"
              data-accent={card.accent}
              aria-labelledby={`metric-title-${card.id}`}
              aria-busy={state.isLoading}
            >
              <p className="sr-only">{metric.explanation}</p>
              <div className="metric-body">
                <div className="metric-heading">
                  <div className="metric-heading-copy">
                    <h2 id={`metric-title-${card.id}`}>
                      <Link
                        to={card.to}
                        search={card.search as never}
                        className="metric-link"
                        title={`Abrir ${card.to === "/agenda" ? "agenda" : "atendimentos"}`}
                      >
                        {card.label}
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </Link>
                    </h2>
                    <p className="metric-selected-period">
                      <CalendarDays size={12} aria-hidden="true" />
                      <span>{metric.periodLabel}</span>
                    </p>
                  </div>
                  <PeriodPicker
                    card={card}
                    metric={metric}
                    period={periods[card.id]}
                    onChange={(period) =>
                      setPeriods((current) => ({ ...current, [card.id]: period }))
                    }
                  />
                </div>
                <div className="metric-reading" aria-live="polite" aria-atomic="true">
                  {state.isLoading ? (
                    <>
                      <span className="metric-skeleton" aria-hidden="true" />
                      <span className="sr-only">Carregando {card.label}</span>
                    </>
                  ) : (
                    <span
                      className="metric-value"
                      aria-label={state.isError ? "Indicador indisponível" : undefined}
                    >
                      {state.isError
                        ? "—"
                        : metric.value.toLocaleString("pt-BR", { minimumIntegerDigits: 2 })}
                    </span>
                  )}
                  <p className="metric-detail">
                    {state.isError
                      ? "Não foi possível carregar"
                      : state.isLoading
                        ? "Atualizando indicador"
                        : metric.detail}
                  </p>
                </div>
              </div>
              {state.isLoading ? (
                <div className="metric-chart-state">
                  <span className="metric-chart-skeleton" aria-hidden="true" />
                </div>
              ) : state.isError ? (
                <div className="metric-chart-state">
                  <button
                    type="button"
                    className="metric-retry"
                    onClick={() =>
                      void (card.id === "visitas"
                        ? metrics.retryAgenda()
                        : metrics.retryAttendances())
                    }
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <MetricChart metric={metric} label={card.label} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
