import type { MarketingCampaign } from "@/types/marketing";

export type Competence = string; // YYYY-MM

export function currentCompetence(now = new Date()): Competence {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function shiftCompetence(c: Competence, delta: number): Competence {
  const [y, m] = c.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function competenceRange(c: Competence) {
  const [y, m] = c.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { since: `${c}-01`, until: `${c}-${String(last).padStart(2, "0")}` };
}

export type CampaignPeriodStats = {
  campaign: MarketingCampaign;
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpl: number;
  ctr: number;
  frequency: number;
};

export type PeriodKpis = {
  spend: number;
  leads: number;
  cpl: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  impressions: number;
  clicks: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function overlaps(c: MarketingCampaign, range: { since: string; until: string }) {
  return c.startDate <= range.until && (c.endDate || "9999") >= range.since;
}

export function campaignStats(c: MarketingCampaign, comp: Competence): CampaignPeriodStats {
  const range = competenceRange(comp);
  const days = c.dailyMetrics.filter((d) => d.date >= range.since && d.date <= range.until);
  const hasSpend = c.dailyMetrics.some((d) => d.spend !== undefined);
  let spend = days.reduce((s, d) => s + (d.spend ?? 0), 0);
  // Manual campaigns without daily spend: count the full investment in months the campaign runs.
  if (!hasSpend && overlaps(c, range)) spend = c.investment;
  const leads = days.reduce((s, d) => s + d.leads, 0);
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const impressions = days.reduce((s, d) => s + (d.impressions ?? d.views ?? 0), 0);
  const reach = days.reduce((s, d) => s + (d.reach ?? 0), 0);
  return {
    campaign: c,
    spend: r2(spend),
    leads,
    clicks,
    impressions,
    reach,
    cpl: leads > 0 ? r2(spend / leads) : 0,
    ctr: impressions > 0 ? r2((clicks / impressions) * 100) : 0,
    frequency: reach > 0 ? r2(impressions / reach) : 0,
  };
}

export function periodKpis(stats: CampaignPeriodStats[]): PeriodKpis {
  const sum = (k: keyof CampaignPeriodStats) => stats.reduce((s, x) => s + (x[k] as number), 0);
  const spend = r2(sum("spend"));
  const leads = sum("leads");
  const clicks = sum("clicks");
  const impressions = sum("impressions");
  const reach = sum("reach");
  return {
    spend,
    leads,
    clicks,
    impressions,
    reach,
    cpl: leads > 0 ? r2(spend / leads) : 0,
    ctr: impressions > 0 ? r2((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? r2(spend / clicks) : 0,
    cpm: impressions > 0 ? r2((spend / impressions) * 1000) : 0,
    frequency: reach > 0 ? r2(impressions / reach) : 0,
  };
}

export function delta(curr: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export type TrendPoint = { date: string; label: string; spend: number; leads: number; cpl: number; ctr: number };

export function dailyTrend(campaigns: MarketingCampaign[], comp: Competence): TrendPoint[] {
  const range = competenceRange(comp);
  const map = new Map<string, { spend: number; leads: number; clicks: number; impressions: number }>();
  for (const c of campaigns)
    for (const d of c.dailyMetrics) {
      if (d.date < range.since || d.date > range.until) continue;
      const a = map.get(d.date) ?? { spend: 0, leads: 0, clicks: 0, impressions: 0 };
      a.spend += d.spend ?? 0;
      a.leads += d.leads;
      a.clicks += d.clicks;
      a.impressions += d.impressions ?? d.views ?? 0;
      map.set(d.date, a);
    }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      spend: r2(a.spend),
      leads: a.leads,
      cpl: a.leads > 0 ? r2(a.spend / a.leads) : 0,
      ctr: a.impressions > 0 ? r2((a.clicks / a.impressions) * 100) : 0,
    }));
}

export type Insight = { tone: "success" | "warning" | "danger" | "neutral"; text: string };

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function buildInsights(curr: CampaignPeriodStats[], prev: CampaignPeriodStats[]): Insight[] {
  const out: Insight[] = [];
  const withLeads = curr.filter((s) => s.leads > 0 && s.spend > 0).sort((a, b) => a.cpl - b.cpl);
  if (withLeads[0]) out.push({ tone: "success", text: `Melhor CPL: ${withLeads[0].campaign.name} (${money(withLeads[0].cpl)}).` });
  const noLeads = curr.filter((s) => s.spend >= 50 && s.leads === 0).sort((a, b) => b.spend - a.spend);
  if (noLeads[0]) out.push({ tone: "danger", text: `${noLeads[0].campaign.name} gastou ${money(noLeads[0].spend)} sem leads.` });
  const saturated = curr.filter((s) => s.frequency > 3).sort((a, b) => b.frequency - a.frequency);
  if (saturated[0])
    out.push({ tone: "warning", text: `Frequência ${saturated[0].frequency.toFixed(1)} em ${saturated[0].campaign.name}: público saturando.` });
  const drops = curr
    .map((s) => ({ s, p: prev.find((x) => x.campaign.id === s.campaign.id) }))
    .filter(({ s, p }) => p && p.ctr > 0 && s.impressions > 0 && s.ctr < p.ctr * 0.8)
    .sort((a, b) => a.s.ctr / a.p!.ctr - b.s.ctr / b.p!.ctr);
  if (drops[0])
    out.push({ tone: "warning", text: `CTR de ${drops[0].s.campaign.name} caiu de ${drops[0].p!.ctr.toFixed(2)}% para ${drops[0].s.ctr.toFixed(2)}%.` });
  if (!out.length && curr.some((s) => s.spend > 0)) out.push({ tone: "neutral", text: "Sem alertas nesta competência." });
  return out.slice(0, 4);
}
