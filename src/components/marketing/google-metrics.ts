import type {
  GoogleMarketingOverview,
  GoogleMetricTotals,
} from "@/lib/marketing/google-overview.types";

export type Metric = keyof GoogleMetricTotals | "ctr" | "cpc";
export const metrics: { key: Metric; label: string; money?: boolean; percent?: boolean }[] = [
  { key: "cost", label: "Custo", money: true },
  { key: "clicks", label: "Cliques" },
  { key: "conversions", label: "Conversões" },
  { key: "costPerConversion", label: "Custo / conversão", money: true },
  { key: "impressions", label: "Impressões" },
  { key: "ctr", label: "CTR", percent: true },
  { key: "cpc", label: "CPC médio", money: true },
];
/** Ratios are derived after aggregation using integer arithmetic, not averages of daily rates. */
export function googleRatio(
  numerator: string | null,
  denominator: string | null,
  scale = 1,
): string | null {
  if (
    !numerator ||
    !denominator ||
    !/^-?\d+(?:\.\d+)?$/.test(numerator) ||
    !/^\d+(?:\.\d+)?$/.test(denominator) ||
    numerator.length > 100 ||
    denominator.length > 100
  )
    return null;
  const parse = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    return {
      value: BigInt(whole + fraction) * (negative ? -1n : 1n),
      scale: 10n ** BigInt(fraction.length),
    };
  };
  const n = parse(numerator),
    d = parse(denominator);
  if (d.value === 0n) return null;
  const raw = n.value * d.scale * BigInt(scale) * 100n;
  const base = d.value * n.scale;
  const abs = raw < 0n ? -raw : raw;
  const rounded = (abs + base / 2n) / base;
  return `${raw < 0n ? "-" : ""}${rounded / 100n}.${String(rounded % 100n).padStart(2, "0")}`;
}

export function metricRaw(key: Metric, totals: GoogleMetricTotals): string | null {
  return key === "ctr"
    ? googleRatio(totals.clicks, totals.impressions, 100)
    : key === "cpc"
      ? googleRatio(totals.cost, totals.clicks)
      : totals[key];
}

export function googleMetricLabel(
  metric: Metric,
  totals: GoogleMetricTotals,
  currency: string | null,
  coverage: GoogleMarketingOverview["coverage"],
) {
  if (coverage === "unavailable") return "—";
  const definition = metrics.find((item) => item.key === metric)!;
  const value = googleMetricValue(metricRaw(metric, totals), currency, Boolean(definition.money));
  return definition.percent && value !== "—" ? `${value}%` : value;
}

/** Formats serialized decimal values without converting int64 or micros to floats. */
export function googleMetricValue(
  value: string | null,
  currency?: string | null,
  money = false,
): string {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value) || (money && !currency)) return "—";
  const negative = value.startsWith("-");
  let [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (money) {
    const cents =
      BigInt(whole) * 100n +
      BigInt((fraction + "00").slice(0, 2)) +
      (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n);
    whole = String(cents / 100n);
    fraction = String(cents % 100n).padStart(2, "0");
  } else fraction = fraction.replace(/0+$/, "");
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fraction ? `,${fraction}` : "");
  return `${negative ? "−" : ""}${money ? `${currency === "BRL" ? "R$" : currency} ` : ""}${formatted}`;
}

const blankTotals: GoogleMetricTotals = {
  cost: null,
  impressions: null,
  clicks: null,
  conversions: null,
  ctr: null,
  cpc: null,
  costPerConversion: null,
};
type Bucket = "day" | "week" | "month";
function sumDecimals(values: Array<string | null>): string | null {
  if (
    values.some((value) => value === null || !/^-?\d+(?:\.\d+)?$/.test(value) || value.length > 100)
  )
    return null;
  const decimals = values as string[];
  const precision = Math.max(0, ...decimals.map((value) => (value.split(".")[1] ?? "").length));
  const total = decimals.reduce((sum, value) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    return sum + BigInt(whole + fraction.padEnd(precision, "0")) * (negative ? -1n : 1n);
  }, 0n);
  const base = 10n ** BigInt(precision),
    magnitude = total < 0n ? -total : total;
  return `${total < 0n ? "-" : ""}${magnitude / base}${precision ? `.${String(magnitude % base).padStart(precision, "0")}` : ""}`;
}

export function googleTrendBuckets(
  data: GoogleMarketingOverview["series"],
  since: string,
  until: string,
  grain: Bucket,
) {
  if (!data) return null;
  const start = Date.parse(`${since}T00:00:00Z`),
    end = Date.parse(`${until}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 366 * 86400000
  )
    return null;
  const source = new Map(data.map((point) => [point.date, point.metrics]));
  const buckets = new Map<string, GoogleMetricTotals[]>();
  for (let time = start; time <= end; time += 86400000) {
    const day = new Date(time),
      date = day.toISOString().slice(0, 10);
    const key =
      grain === "day"
        ? date
        : grain === "month"
          ? date.slice(0, 7)
          : new Date(time - ((day.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const list = buckets.get(key) ?? [];
    list.push(source.get(date) ?? blankTotals);
    buckets.set(key, list);
  }
  return [...buckets].map(([date, rows]) => {
    const cost = sumDecimals(rows.map((row) => row.cost)),
      clicks = sumDecimals(rows.map((row) => row.clicks)),
      impressions = sumDecimals(rows.map((row) => row.impressions)),
      conversions = sumDecimals(rows.map((row) => row.conversions));
    return {
      date,
      metrics: {
        cost,
        clicks,
        impressions,
        conversions,
        ctr: googleRatio(clicks, impressions, 100),
        cpc: googleRatio(cost, clicks),
        costPerConversion: googleRatio(cost, conversions),
      },
    };
  });
}

/** A missing or invalid account timezone must not imply a closed or complete day. */
export function googleTodayInZone(timezone: string | null, now = new Date()): string | null {
  if (!timezone || !Number.isFinite(now.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return null;
  }
}

export function googleChartDate(value: string, grain: Bucket, long = false) {
  const date = new Date(`${value.length === 7 ? `${value}-01` : value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    ...(grain === "month"
      ? { month: long ? "long" : "short", year: "numeric" }
      : { day: "numeric", month: long ? "long" : "short", ...(long ? { year: "numeric" } : {}) }),
  })
    .format(date)
    .replaceAll(" de ", " ")
    .replaceAll(".", "");
  return grain === "week" && long ? `Semana de ${formatted}` : formatted;
}
