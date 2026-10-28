import type { MarketingCampaign } from "@/types/marketing";

export type Competence = string;
export type DateRange = { since: string; until: string };

export function currentCompetence(now = new Date(), timeZone = "America/Sao_Paulo"): Competence {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}
export function shiftCompetence(c: Competence, amount: number): Competence {
  const [y, m] = c.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + amount, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function competenceRange(c: Competence): DateRange {
  const [y, m] = c.split("-").map(Number);
  return {
    since: `${c}-01`,
    until: `${c}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`,
  };
}
/** Compare month-to-date with the same number of account-calendar days. */
export function comparisonRanges(c: Competence, now = new Date(), timeZone = "America/Sao_Paulo") {
  const current = competenceRange(c);
  const previous = competenceRange(shiftCompetence(c, -1));
  if (c === currentCompetence(now, timeZone)) {
    const day = Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "2-digit" }).format(now));
    current.until = `${c}-${String(day).padStart(2, "0")}`;
    const previousLast = Number(previous.until.slice(-2));
    previous.until = `${previous.since.slice(0, 7)}-${String(Math.min(day, previousLast)).padStart(2, "0")}`;
  }
  return { current, previous };
}
const round = (v: number) => Math.round(v * 100) / 100;
const ratio = (numerator: number | null, denominator: number, scale = 1) =>
  numerator === null || denominator <= 0 ? null : round((numerator / denominator) * scale);

export type CampaignPeriodStats = {
  campaign: MarketingCampaign;
  spend: number | null;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number | null;
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
  currency: string | null;
  hasData: boolean;
};
export type PeriodKpis = {
  spend: number | null;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  reach: number | null;
  frequency: number | null;
  impressions: number;
  clicks: number;
  activeCampaigns: number;
  currency: string | null;
  mixedCurrencies: boolean;
  hasData?: boolean;
};

export function campaignStats(
  c: MarketingCampaign,
  comp: Competence,
  requestedRange?: DateRange,
): CampaignPeriodStats {
  const range = requestedRange ?? competenceRange(comp);
  const days = c.dailyMetrics.filter((d) => d.date >= range.since && d.date <= range.until);
  const hasDailySpend = c.dailyMetrics.some((d) => d.spend !== undefined);
  let spend: number | null =
    c.financialVisible === false || c.investment === null
      ? null
      : days.reduce((s, d) => s + (d.spend ?? 0), 0);
  if (spend !== null && !hasDailySpend) {
    const contained = c.startDate >= range.since && Boolean(c.endDate) && c.endDate <= range.until;
    spend = !c.platform && contained ? c.investment : null;
  }
  const leads = days.reduce((s, d) => s + d.leads, 0);
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const impressions = days.reduce((s, d) => s + (d.impressions ?? 0), 0);
  const aggregate =
    c.periodAggregate?.since === range.since && c.periodAggregate.until === range.until
      ? c.periodAggregate
      : null;
  // An old successful sync for another period is not evidence of zero delivery here.
  const confirmedEmpty = aggregate?.has_data === false && !aggregate.reach;
  if (c.platform && days.length === 0)
    spend = confirmedEmpty && c.financialVisible !== false ? 0 : null;
  // Reach is non-additive: daily reach is never a substitute for a period aggregate.
  const reach = aggregate?.reach ?? null;
  return {
    campaign: c,
    spend: spend === null ? null : round(spend),
    leads,
    clicks,
    impressions,
    reach,
    cpl: ratio(spend, leads),
    ctr: ratio(clicks, impressions, 100),
    frequency: aggregate?.frequency ?? ratio(impressions, reach ?? 0),
    hasData: days.length > 0 || confirmedEmpty || (!c.platform && spend !== null),
    currency: c.currency ?? (c.platform ? null : "BRL"),
  };
}
export function periodKpis(stats: CampaignPeriodStats[]): PeriodKpis {
  const currencies = new Set(stats.filter((s) => s.hasData).map((s) => s.currency));
  const mixedCurrencies = currencies.size > 1 || currencies.has(null);
  const protectedSpend = stats.some((s) => s.spend === null);
  const spend =
    mixedCurrencies || protectedSpend ? null : round(stats.reduce((s, x) => s + (x.spend ?? 0), 0));
  const leads = stats.reduce((s, x) => s + x.leads, 0);
  const clicks = stats.reduce((s, x) => s + x.clicks, 0);
  const impressions = stats.reduce((s, x) => s + x.impressions, 0);
  // Several campaigns may reach the same people. Only one exact-scope aggregate is safe here.
  const reach = stats.length === 1 ? stats[0].reach : null;
  return {
    spend,
    leads,
    clicks,
    impressions,
    reach,
    cpl: ratio(spend, leads),
    ctr: ratio(clicks, impressions, 100),
    cpc: ratio(spend, clicks),
    cpm: ratio(spend, impressions, 1000),
    frequency: stats.length === 1 ? stats[0].frequency : null,
    activeCampaigns: stats.filter((s) => s.campaign.status === "Ativa").length,
    currency: !mixedCurrencies ? ([...currencies][0] ?? "BRL") : null,
    mixedCurrencies,
    hasData: stats.some((s) => s.hasData),
  };
}
export function summaryKpis(summary: {
  spend: number | null;
  leads: number;
  clicks: number;
  impressions: number;
  active_campaigns: number;
  currencies: Array<string | null>;
  has_data: boolean;
}): PeriodKpis {
  const currencies = new Set(
    summary.currencies.map((value) => (value && /^[A-Z]{3}$/.test(value) ? value : null)),
  );
  const mixedCurrencies = currencies.size > 1 || currencies.has(null);
  const spend = mixedCurrencies || !summary.has_data ? null : summary.spend;
  return {
    spend,
    leads: summary.leads,
    clicks: summary.clicks,
    impressions: summary.impressions,
    activeCampaigns: summary.active_campaigns,
    cpl: ratio(spend, summary.leads),
    ctr: ratio(summary.clicks, summary.impressions, 100),
    cpc: ratio(spend, summary.clicks),
    cpm: ratio(spend, summary.impressions, 1000),
    reach: null,
    frequency: null,
    currency: !mixedCurrencies ? ([...currencies][0] ?? "BRL") : null,
    mixedCurrencies,
    hasData: summary.has_data,
  };
}
export function delta(curr: number | null, prev: number | null): number | null {
  return curr === null || prev === null || prev === 0
    ? null
    : Math.round(((curr - prev) / prev) * 1000) / 10;
}
export type TrendPoint = {
  date: string;
  label: string;
  spend: number | null;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  clicks: number;
};
export function dailyTrend(
  campaigns: MarketingCampaign[],
  comp: Competence,
  range = competenceRange(comp),
): TrendPoint[] {
  const currencies = new Set(campaigns.map((c) => c.currency ?? (c.platform ? null : "BRL")));
  const financial =
    currencies.size <= 1 &&
    !currencies.has(null) &&
    campaigns.every((c) => c.financialVisible !== false);
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const map = new Map<
    string,
    {
      spend: number;
      spendComplete: boolean;
      observedCampaigns: Set<string>;
      leads: number;
      clicks: number;
      impressions: number;
    }
  >();
  for (const c of campaigns)
    for (const d of c.dailyMetrics) {
      if (d.date < range.since || d.date > range.until) continue;
      const a = map.get(d.date) ?? {
        spend: 0,
        spendComplete: true,
        observedCampaigns: new Set<string>(),
        leads: 0,
        clicks: 0,
        impressions: 0,
      };
      a.spend += d.spend ?? 0;
      a.spendComplete &&= d.spend !== undefined;
      a.observedCampaigns.add(c.id);
      a.leads += d.leads;
      a.clicks += d.clicks;
      a.impressions += d.impressions ?? 0;
      map.set(d.date, a);
    }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => {
      // Missing campaign rows are unknown delivery, not evidence of zero daily cost.
      const complete = a.spendComplete && a.observedCampaigns.size === campaignIds.size;
      const spend = financial && complete ? round(a.spend) : null;
      return {
        date,
        label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        spend,
        leads: a.leads,
        clicks: a.clicks,
        cpl: ratio(spend, a.leads),
        ctr: ratio(a.clicks, a.impressions, 100),
      };
    });
}
/** Align equal calendar positions while preserving gaps and the actual date of each period. */
export type ComparedTrendPoint = {
  position: number;
  label: string;
  currentDate: string | null;
  previousDate: string | null;
  current: TrendPoint | null;
  previous: TrendPoint | null;
};
export function compareDailyTrends(
  current: TrendPoint[],
  previous: TrendPoint[],
  ranges: { current: DateRange; previous: DateRange },
): ComparedTrendPoint[] {
  const day = 86400000;
  const start = (range: DateRange) => Date.parse(`${range.since}T12:00:00Z`);
  const length = (range: DateRange) =>
    Math.max(0, Math.round((Date.parse(`${range.until}T12:00:00Z`) - start(range)) / day) + 1);
  const currentMap = new Map(current.map((point) => [point.date, point]));
  const previousMap = new Map(previous.map((point) => [point.date, point]));
  const currentLength = length(ranges.current),
    previousLength = length(ranges.previous);
  // Product ranges are limited to 367 days; keep malformed callers bounded too.
  return Array.from(
    { length: Math.min(367, Math.max(currentLength, previousLength)) },
    (_, index) => {
      const currentDate =
        index < currentLength
          ? new Date(start(ranges.current) + index * day).toISOString().slice(0, 10)
          : null;
      const previousDate =
        index < previousLength
          ? new Date(start(ranges.previous) + index * day).toISOString().slice(0, 10)
          : null;
      return {
        position: index + 1,
        label: currentDate
          ? `${currentDate.slice(8, 10)}/${currentDate.slice(5, 7)}`
          : `${index + 1}º dia`,
        currentDate,
        previousDate,
        current: currentDate ? (currentMap.get(currentDate) ?? null) : null,
        previous: previousDate ? (previousMap.get(previousDate) ?? null) : null,
      };
    },
  );
}
export type Insight = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
  financial?: boolean;
};
export function buildInsights(curr: CampaignPeriodStats[], prev: CampaignPeriodStats[]): Insight[] {
  const out: Insight[] = [];
  const money = (s: CampaignPeriodStats, amount: number) =>
    amount.toLocaleString("pt-BR", { style: "currency", currency: s.currency ?? "BRL" });
  const withLeads = curr
    .filter((s) => s.leads > 0 && s.cpl !== null && (s.spend ?? 0) > 0)
    .sort((a, b) => a.cpl! - b.cpl!);
  if (withLeads[0]) {
    const s = withLeads[0];
    out.push({
      tone: "neutral",
      financial: true,
      text: `${s.campaign.name}: ${s.leads} leads reportados, CPL ${money(s, s.cpl!)} no período selecionado.`,
    });
  }
  const noLeads = curr.find((s) => (s.spend ?? 0) > 0 && s.leads === 0);
  if (noLeads)
    out.push({
      tone: "warning",
      financial: true,
      text: `${noLeads.campaign.name}: investimento de ${money(noLeads, noLeads.spend!)} e nenhum lead reportado no período.`,
    });
  const drop = curr
    .map((s) => ({ s, p: prev.find((p) => p.campaign.id === s.campaign.id) }))
    .find(
      ({ s, p }) =>
        p?.ctr != null &&
        s.ctr != null &&
        s.impressions >= 100 &&
        p.impressions >= 100 &&
        s.ctr < p.ctr,
    );
  if (drop)
    out.push({
      tone: "neutral",
      text: `${drop.s.campaign.name}: CTR ${drop.s.ctr!.toFixed(2)}% em ${drop.s.impressions.toLocaleString("pt-BR")} impressões; período anterior equivalente: ${drop.p!.ctr!.toFixed(2)}%.`,
    });
  if (!out.length)
    out.push({
      tone: "neutral",
      text: curr.some((s) => s.hasData)
        ? `Nesta página: ${curr.reduce((sum, stat) => sum + stat.leads, 0).toLocaleString("pt-BR")} leads reportados e ${curr.reduce((sum, stat) => sum + stat.clicks, 0).toLocaleString("pt-BR")} cliques no período.`
        : "Ainda não há métricas para analisar neste período.",
    });
  return out.slice(0, 3);
}
