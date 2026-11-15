import { ACTIVE_PIPELINE_STAGES, type Atendimento } from "@/types/atendimento";
import type { AgendaEvent } from "@/types/agenda";
import { matchesTrack } from "@/lib/atendimentos/track";

export const metricIds = ["atendimentos", "clientes", "aluguel", "compra", "visitas"] as const;
export type MetricId = (typeof metricIds)[number];
export type MetricPeriod =
  | { kind: "today" | "7d" | "30d" | "month" | "previous-month" | "year" | "all" | "upcoming" }
  | { kind: "selected-month"; month: string }
  | { kind: "custom"; start: string; end: string };
export type DashboardPeriods = Record<MetricId, MetricPeriod>;
export const defaultDashboardPeriods: DashboardPeriods = {
  atendimentos: { kind: "month" },
  clientes: { kind: "month" },
  aluguel: { kind: "all" },
  compra: { kind: "all" },
  visitas: { kind: "upcoming" },
};
export type MetricBucket = { label: string; value: number };
export type DashboardMetric = {
  value: number;
  periodLabel: string;
  detail: string;
  explanation: string;
  buckets: MetricBucket[];
  chartLabel: string;
  startLabel: string;
  endLabel: string;
  undated: number;
};

const DAY = 86_400_000;
const businessDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
});
const fullDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const monthDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
const activeStages = new Set(ACTIVE_PIPELINE_STAGES);

/** Calendar-day arithmetic avoids UTC parsing shifts and daylight-saving boundaries. */
function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time / DAY;
}

function recordDay(value: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDay(value);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = businessDate.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return parseDay(`${get("year")}-${get("month")}-${get("day")}`);
}

export function validateMetricDates(start: string, end: string): string | null {
  const first = parseDay(start);
  const last = parseDay(end);
  if (first === null || last === null) return "Preencha as duas datas válidas.";
  if (first > last) return "A data final deve ser igual ou posterior à inicial.";
  return null;
}

export function isValidMetricMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month) && parseDay(`${month}-01`) !== null;
}

function dayOfMonth(year: number, month: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 1);
  return date.getTime() / DAY;
}

function resolvePeriod(period: MetricPeriod, now: Date) {
  const today = recordDay(now.toISOString())!;
  const date = new Date(today * DAY);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const currentMonth = dayOfMonth(year, month);
  switch (period.kind) {
    case "today":
      return { start: today, end: today + 1, label: "Hoje" };
    case "7d":
      return { start: today - 6, end: today + 1, label: "Últimos 7 dias" };
    case "30d":
      return { start: today - 29, end: today + 1, label: "Últimos 30 dias" };
    case "month":
      return { start: currentMonth, end: dayOfMonth(year, month + 1), label: "Este mês" };
    case "previous-month":
      return { start: dayOfMonth(year, month - 1), end: currentMonth, label: "Mês anterior" };
    case "year":
      return { start: dayOfMonth(year, 0), end: dayOfMonth(year + 1, 0), label: "Este ano" };
    case "all":
      return { start: -Infinity, end: Infinity, label: "Todo o período" };
    case "upcoming":
      return { start: today, end: Infinity, label: "A partir de hoje" };
    case "selected-month": {
      if (!isValidMetricMonth(period.month)) throw new Error("Mês inválido.");
      const start = parseDay(`${period.month}-01`)!;
      const selected = new Date(start * DAY);
      return {
        start,
        end: dayOfMonth(selected.getUTCFullYear(), selected.getUTCMonth() + 1),
        label: monthDate.format(selected),
      };
    }
    case "custom": {
      const error = validateMetricDates(period.start, period.end);
      if (error) throw new Error(error);
      return {
        start: parseDay(period.start)!,
        end: parseDay(period.end)! + 1,
        label: `${fullDate.format(new Date(`${period.start}T00:00:00Z`))} – ${fullDate.format(new Date(`${period.end}T00:00:00Z`))}`,
      };
    }
  }
}

function makeBuckets(days: number[], start: number, end: number) {
  const span = end - start;
  const monthly = span > 90;
  const boundaries: number[] = [start];
  let groupedMonths = false;
  if (monthly) {
    const first = new Date(start * DAY);
    const last = new Date((end - 1) * DAY);
    const months =
      (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
      last.getUTCMonth() -
      first.getUTCMonth() +
      1;
    const step = Math.max(1, Math.ceil(months / 24));
    groupedMonths = step > 1;
    for (let offset = step; ; offset += step) {
      const next = dayOfMonth(first.getUTCFullYear(), first.getUTCMonth() + offset);
      if (next >= end) break;
      boundaries.push(next);
    }
  } else {
    const step = span <= 31 ? 1 : 7;
    for (let next = start + step; next < end; next += step) boundaries.push(next);
  }
  boundaries.push(end);
  const buckets = boundaries.slice(0, -1).map((from, index) => {
    const to = boundaries[index + 1];
    const format = (day: number) => fullDate.format(new Date(day * DAY));
    return {
      label: to - from === 1 ? format(from) : `${format(from)} – ${format(to - 1)}`,
      value: 0,
    };
  });
  for (const day of days) {
    const index = boundaries.findIndex((from, i) => day >= from && day < boundaries[i + 1]);
    if (index >= 0) buckets[index].value++;
  }
  return {
    buckets,
    unit: monthly
      ? groupedMonths
        ? "por período"
        : "por mês"
      : span <= 31
        ? "por dia"
        : "por semana",
  };
}

/** Counts and charts share the exact same filtered records. No synthetic trends. */
export function buildDashboardMetrics(
  attendances: Atendimento[],
  events: AgendaEvent[],
  periods: DashboardPeriods,
  now = new Date(),
  agency: "todas" | "cordial" | "morar" = "todas",
): Record<MetricId, DashboardMetric> {
  const scoped = attendances.filter(
    (item) => agency === "todas" || item.imobiliaria === agency || item.imobiliaria === "ambas",
  );
  const active = scoped.filter((item) => activeStages.has(item.pipelineStage));
  const dates: Record<MetricId, (number | null)[]> = {
    atendimentos: scoped.map((item) => recordDay(item.criadoEm)),
    clientes: scoped
      .filter((item) => item.pipelineStage === "fechamento")
      .map((item) => recordDay(item.criadoEm)),
    aluguel: active
      .filter((item) => matchesTrack(item, "aluguel"))
      .map((item) => recordDay(item.criadoEm)),
    compra: active
      .filter((item) => matchesTrack(item, "venda"))
      .map((item) => recordDay(item.criadoEm)),
    visitas: events
      .filter(
        (event) =>
          event.tipo === "visita" &&
          event.status !== "concluido" &&
          event.status !== "cancelado" &&
          (agency === "todas" || event.imobiliaria === agency || event.imobiliaria === "ambas"),
      )
      .map((event) => recordDay(event.inicio)),
  };
  return Object.fromEntries(
    metricIds.map((id) => {
      const period = resolvePeriod(periods[id], now);
      const selected = dates[id].filter((day) =>
        day === null ? periods[id].kind === "all" : day >= period.start && day < period.end,
      );
      const dated = selected.filter((day): day is number => day !== null);
      const today = recordDay(now.toISOString())!;
      let first = today;
      let last = today;
      if (dated.length) {
        first = dated[0];
        last = dated[0];
        for (const day of dated) {
          first = Math.min(first, day);
          last = Math.max(last, day);
        }
      }
      const start = Number.isFinite(period.start) ? period.start : first;
      const end = Number.isFinite(period.end) ? period.end : Math.max(start + 1, last + 1);
      const { buckets, unit } = makeBuckets(dated, start, end);
      const details: Record<MetricId, string> = {
        atendimentos: "atendimentos recebidos",
        clientes: "na etapa de fechamento",
        aluguel: "atendimentos ativos hoje",
        compra: "atendimentos ativos hoje",
        visitas: "visitas pendentes na agenda",
      };
      if (id === "atendimentos" && Number.isFinite(period.start) && Number.isFinite(period.end)) {
        const date = new Date(period.start * DAY);
        const isMonth = ["month", "previous-month", "selected-month"].includes(periods[id].kind);
        const previousStart = isMonth
          ? dayOfMonth(date.getUTCFullYear(), date.getUTCMonth() - 1)
          : periods[id].kind === "year"
            ? dayOfMonth(date.getUTCFullYear() - 1, 0)
            : period.start - (period.end - period.start);
        const previous = dates[id].filter(
          (day) => day !== null && day >= previousStart && day < period.start,
        ).length;
        const delta = selected.length - previous;
        details.atendimentos = `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR")} vs. ${isMonth ? "mês" : "período"} anterior`;
      }
      const explanations: Record<MetricId, string> = {
        atendimentos: "Atendimentos pela data de cadastro, em qualquer etapa.",
        clientes:
          "Mantém o critério do painel: atendimentos hoje em fechamento, filtrados pela data de cadastro. Não representa a data de conversão nem clientes únicos.",
        aluguel:
          "Atendimentos ativos hoje buscando aluguel. O período filtra a data de cadastro; não é um retrato histórico do funil.",
        compra:
          "Atendimentos ativos hoje buscando compra. O período filtra a data de cadastro; não é um retrato histórico do funil.",
        visitas:
          "Visitas pela data agendada, sem concluídas ou canceladas. O período pode incluir datas passadas com visitas ainda pendentes.",
      };
      return [
        id,
        {
          value: selected.length,
          periodLabel: period.label,
          detail: details[id],
          explanation: explanations[id],
          buckets,
          chartLabel: `${id === "visitas" ? "Agenda" : "Entradas"} ${unit}`,
          startLabel: shortDate.format(new Date(start * DAY)),
          endLabel: shortDate.format(new Date((end - 1) * DAY)),
          undated: selected.length - dated.length,
        },
      ];
    }),
  ) as Record<MetricId, DashboardMetric>;
}
