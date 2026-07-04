import {
  chartAccent,
  chartDanger,
  chartGraphite,
  chartMorar,
  chartMuted,
  chartSuccess,
  chartSystem,
  chartWarning,
} from "@/lib/chart-palette";
import type {
  MarketingAgencyId,
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingChannel,
  MarketingChannelFilter,
  MarketingDailyMetric,
  MarketingLocationBreakdown,
  MarketingObjective,
  MarketingStatusFilter,
} from "@/types/marketing";

export const marketingStatusFilters: Array<{ value: MarketingStatusFilter; label: string }> = [
  { value: "Todas", label: "Todas" },
  { value: "Ativa", label: "Ativas" },
  { value: "Planejada", label: "Planejadas" },
  { value: "Pausada", label: "Pausadas" },
  { value: "Encerrada", label: "Encerradas" },
  { value: "Com baixo desempenho", label: "Baixo desempenho" },
];

export const marketingChannelFilters: Array<{ value: MarketingChannelFilter; label: string }> = [
  { value: "Todos", label: "Todos os canais" },
  { value: "Instagram", label: "Instagram" },
  { value: "Facebook", label: "Facebook" },
  { value: "Google", label: "Google" },
  { value: "WhatsApp", label: "WhatsApp" },
  { value: "E-mail", label: "E-mail" },
  { value: "Externa", label: "Externa" },
];

export const marketingChannels: MarketingChannel[] = [
  "Instagram",
  "Facebook",
  "Google",
  "WhatsApp",
  "E-mail",
  "Portal imobiliário",
  "Open house",
  "Externa",
];

export const marketingStatuses: MarketingCampaignStatus[] = [
  "Ativa",
  "Planejada",
  "Pausada",
  "Encerrada",
  "Em análise",
  "Com baixo desempenho",
];

export const marketingObjectives: MarketingObjective[] = [
  "Leads qualificados",
  "Visitas",
  "Captação",
  "Venda",
  "Locação",
  "Relacionamento",
  "Reconhecimento",
];

export type MarketingSummary = {
  totalLeads: number;
  totalInvestment: number;
  costPerLead: number;
  clicks: number;
  accesses: number;
  views: number;
  conversionRate: number;
  activeCampaigns: number;
  plannedCampaigns: number;
  pausedCampaigns: number;
  attentionCampaigns: number;
  bestChannel?: ChannelDistributionDatum;
  bestLocation?: LocationDeliveryDatum;
  bestCampaign?: MarketingCampaign;
};

export type CampaignPerformanceDatum = {
  name: string;
  fullName: string;
  leads: number;
  clicks: number;
  views: number;
  conversionRate: number;
  costPerLead: number;
};

export type ChannelDistributionDatum = {
  channel: MarketingChannelFilter;
  label: string;
  leads: number;
  clicks: number;
  views: number;
  investment: number;
  conversionRate: number;
  color: string;
};

export type LeadTrendDatum = {
  date: string;
  label: string;
  leads: number;
  clicks: number;
  accesses: number;
  views: number;
};

export type LocationDeliveryDatum = {
  location: string;
  impressions: number;
  clicks: number;
  leads: number;
  share: number;
};

type LegacyMarketingCampaign = Partial<MarketingCampaign> & {
  nome?: string;
  canal?: string;
  objetivo?: string;
  investimento?: number;
  cliques?: number;
  acessos?: number;
  visualizacoes?: number;
  impressoes?: number;
  taxaConversao?: number;
  custoPorLead?: number;
  melhorRegiao?: string;
  responsavel?: string;
  observacoes?: string;
  dataInicio?: string;
  dataFim?: string;
};

const fallbackEndDate = "2026-06-30";
const channelColors: Record<MarketingChannelFilter, string> = {
  Todos: chartMuted,
  Instagram: chartSystem,
  Facebook: chartMorar,
  Google: chartGraphite,
  WhatsApp: chartSuccess,
  "E-mail": chartWarning,
  Externa: chartAccent,
};

export function normalizeMarketingCampaigns(campaigns: MarketingCampaign[]) {
  return campaigns.map((campaign, index) => normalizeMarketingCampaign(campaign, index));
}

export function normalizeMarketingCampaign(
  campaign: MarketingCampaign,
  index = 0,
): MarketingCampaign {
  const raw = campaign as LegacyMarketingCampaign;
  const name = raw.name ?? raw.nome ?? `Campanha ${index + 1}`;
  const channel = normalizeChannel(raw.channel ?? raw.canal);
  const objective = normalizeObjective(raw.objective ?? raw.objetivo);
  const status = normalizeStatus(raw.status);
  const investment = cleanNumber(raw.investment ?? raw.investimento);
  const startDate = raw.startDate ?? raw.dataInicio ?? "2026-06-01";
  const endDate = raw.endDate ?? raw.dataFim ?? fallbackEndDate;
  const leads = cleanNumber(raw.leads);
  const clicks = cleanNumber(raw.clicks ?? raw.cliques);
  const accesses = cleanNumber(raw.accesses ?? raw.acessos);
  const views = cleanNumber(raw.views ?? raw.visualizacoes);
  const dailyMetrics =
    raw.dailyMetrics?.length && isValidDailyMetrics(raw.dailyMetrics)
      ? raw.dailyMetrics
      : buildFallbackDailyMetrics({
          endDate,
          leads,
          clicks: clicks || leads * 18,
          accesses: accesses || Math.round((clicks || leads * 18) * 0.64),
          views: views || Math.max(clicks * 10, leads * 140),
        });
  const totalLeads = sumDaily(dailyMetrics, "leads");
  const totalClicks = sumDaily(dailyMetrics, "clicks");
  const totalAccesses = sumDaily(dailyMetrics, "accesses");
  const totalViews = sumDaily(dailyMetrics, "views");
  const locationBreakdown =
    raw.locationBreakdown?.length && isValidLocations(raw.locationBreakdown)
      ? raw.locationBreakdown
      : [
          {
            location: raw.bestLocation ?? raw.melhorRegiao ?? "Centro",
            impressions: cleanNumber(raw.impressions ?? raw.impressoes) || totalViews,
            clicks: totalClicks,
            leads: totalLeads,
          },
        ];
  const impressions =
    cleanNumber(raw.impressions ?? raw.impressoes) ||
    locationBreakdown.reduce((total, item) => total + item.impressions, 0);
  const bestLocation =
    raw.bestLocation ??
    raw.melhorRegiao ??
    [...locationBreakdown].sort((a, b) => b.impressions - a.impressions)[0]?.location ??
    "Não informado";

  return {
    id: String(raw.id ?? `campanha-${index + 1}`),
    name,
    channel,
    objective,
    status,
    startDate,
    endDate,
    investment,
    leads: totalLeads,
    clicks: totalClicks,
    accesses: totalAccesses,
    views: totalViews,
    impressions,
    conversionRate: totalAccesses > 0 ? roundMetric((totalLeads / totalAccesses) * 100) : 0,
    costPerLead: totalLeads > 0 ? roundMetric(investment / totalLeads) : 0,
    bestLocation,
    responsiblePerson: raw.responsiblePerson ?? raw.responsavel ?? "Equipe comercial",
    notes: raw.notes ?? raw.observacoes ?? "Sem observações registradas.",
    diagnosis:
      raw.diagnosis ?? getAutomaticDiagnosis(status, totalLeads, totalAccesses, investment),
    expectedLeads: cleanOptionalNumber(raw.expectedLeads),
    referenceUrl: raw.referenceUrl,
    dailyMetrics,
    locationBreakdown,
    createdAt: raw.createdAt ?? `${startDate}T09:00:00.000Z`,
    updatedAt: raw.updatedAt ?? `${endDate}T18:00:00.000Z`,
    imobiliaria: raw.imobiliaria ?? "cordial",
  };
}

export function buildMarketingSummary(campaigns: MarketingCampaign[]): MarketingSummary {
  const totalLeads = sum(campaigns, "leads");
  const totalInvestment = sum(campaigns, "investment");
  const clicks = sum(campaigns, "clicks");
  const accesses = sum(campaigns, "accesses");
  const views = sum(campaigns, "views");
  const investmentWithLeads = campaigns.reduce(
    (total, campaign) => total + (campaign.leads > 0 ? campaign.investment : 0),
    0,
  );
  const channels = buildChannelDistributionData(campaigns);
  const locations = buildLocationDeliveryData(campaigns);

  return {
    totalLeads,
    totalInvestment,
    costPerLead: totalLeads > 0 ? roundMetric(investmentWithLeads / totalLeads) : 0,
    clicks,
    accesses,
    views,
    conversionRate: accesses > 0 ? roundMetric((totalLeads / accesses) * 100) : 0,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "Ativa").length,
    plannedCampaigns: campaigns.filter((campaign) => campaign.status === "Planejada").length,
    pausedCampaigns: campaigns.filter((campaign) => campaign.status === "Pausada").length,
    attentionCampaigns: campaigns.filter((campaign) => isAttentionCampaign(campaign)).length,
    bestChannel: channels[0],
    bestLocation: locations[0],
    bestCampaign: [...campaigns].sort(compareCampaignPerformance)[0],
  };
}

export function filterMarketingCampaigns({
  campaigns,
  status,
  channel,
  search,
}: {
  campaigns: MarketingCampaign[];
  status: MarketingStatusFilter;
  channel: MarketingChannelFilter;
  search: string;
}) {
  const query = normalizeText(search);

  return campaigns.filter((campaign) => {
    const matchesStatus = status === "Todas" || campaign.status === status;
    const matchesChannel =
      channel === "Todos" ? true : getChannelFilterGroup(campaign.channel) === channel;
    const searchable = normalizeText(
      [
        campaign.name,
        campaign.channel,
        campaign.objective,
        campaign.status,
        campaign.bestLocation,
        campaign.responsiblePerson,
        campaign.notes,
        campaign.diagnosis,
      ].join(" "),
    );

    return matchesStatus && matchesChannel && (!query || searchable.includes(query));
  });
}

export function buildCampaignPerformanceData(
  campaigns: MarketingCampaign[],
): CampaignPerformanceDatum[] {
  return [...campaigns]
    .sort(compareCampaignPerformance)
    .slice(0, 7)
    .map((campaign) => ({
      name: getShortCampaignName(campaign.name),
      fullName: campaign.name,
      leads: campaign.leads,
      clicks: campaign.clicks,
      views: campaign.views,
      conversionRate: campaign.conversionRate,
      costPerLead: campaign.costPerLead,
    }));
}

export function buildChannelDistributionData(
  campaigns: MarketingCampaign[],
): ChannelDistributionDatum[] {
  const grouped = new Map<MarketingChannelFilter, ChannelDistributionDatum>();

  campaigns.forEach((campaign) => {
    const channel = getChannelFilterGroup(campaign.channel);
    const current = grouped.get(channel) ?? {
      channel,
      label: channel,
      leads: 0,
      clicks: 0,
      views: 0,
      investment: 0,
      conversionRate: 0,
      color: channelColors[channel],
    };
    current.leads += campaign.leads;
    current.clicks += campaign.clicks;
    current.views += campaign.views;
    current.investment += campaign.investment;
    grouped.set(channel, current);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      conversionRate: item.clicks > 0 ? roundMetric((item.leads / item.clicks) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads);
}

export function buildLeadTrendData(campaigns: MarketingCampaign[]): LeadTrendDatum[] {
  const grouped = new Map<string, LeadTrendDatum>();

  campaigns.forEach((campaign) => {
    campaign.dailyMetrics.forEach((metric) => {
      const current = grouped.get(metric.date) ?? {
        date: metric.date,
        label: shortDateLabel(metric.date),
        leads: 0,
        clicks: 0,
        accesses: 0,
        views: 0,
      };
      current.leads += metric.leads;
      current.clicks += metric.clicks;
      current.accesses += metric.accesses;
      current.views += metric.views;
      grouped.set(metric.date, current);
    });
  });

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildLocationDeliveryData(campaigns: MarketingCampaign[]): LocationDeliveryDatum[] {
  const grouped = new Map<string, Omit<LocationDeliveryDatum, "share">>();

  campaigns.forEach((campaign) => {
    campaign.locationBreakdown.forEach((location) => {
      const current = grouped.get(location.location) ?? {
        location: location.location,
        impressions: 0,
        clicks: 0,
        leads: 0,
      };
      current.impressions += location.impressions;
      current.clicks += location.clicks;
      current.leads += location.leads;
      grouped.set(location.location, current);
    });
  });

  const totalImpressions = Array.from(grouped.values()).reduce(
    (total, item) => total + item.impressions,
    0,
  );

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      share: totalImpressions > 0 ? roundMetric((item.impressions / totalImpressions) * 100) : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

export function getChannelFilterGroup(channel: MarketingChannel): MarketingChannelFilter {
  if (
    channel === "Instagram" ||
    channel === "Facebook" ||
    channel === "Google" ||
    channel === "WhatsApp" ||
    channel === "E-mail"
  ) {
    return channel;
  }

  return "Externa";
}

export function getStatusTone(status: MarketingCampaignStatus) {
  if (status === "Ativa") return "success";
  if (status === "Planejada") return "warning";
  if (status === "Com baixo desempenho") return "danger";
  if (status === "Pausada" || status === "Encerrada") return "neutral";
  return "analysis";
}

export function isAttentionCampaign(campaign: MarketingCampaign) {
  return (
    campaign.status === "Com baixo desempenho" ||
    campaign.diagnosis.toLowerCase().includes("baixa conversão") ||
    campaign.diagnosis.toLowerCase().includes("revisar")
  );
}

export function createDraftMarketingCampaign({
  name,
  channel,
  objective,
  status,
  startDate,
  endDate,
  investment,
  targetRegion,
  notes,
  responsiblePerson,
  expectedLeads,
  referenceUrl,
  agency,
}: {
  name: string;
  channel: MarketingChannel;
  objective: MarketingObjective;
  status: MarketingCampaignStatus;
  startDate: string;
  endDate: string;
  investment: number;
  targetRegion: string;
  notes: string;
  responsiblePerson: string;
  expectedLeads?: number;
  referenceUrl?: string;
  agency: MarketingAgencyId;
}): MarketingCampaign {
  const now = new Date().toISOString();
  const id = `mk-${Date.now().toString(36)}`;

  return normalizeMarketingCampaign({
    id,
    name: name.trim() || "Nova campanha imobiliária",
    channel,
    objective,
    status,
    startDate,
    endDate,
    investment,
    leads: 0,
    clicks: 0,
    accesses: 0,
    views: 0,
    impressions: 0,
    conversionRate: 0,
    costPerLead: 0,
    bestLocation: targetRegion.trim() || "Não informado",
    responsiblePerson: responsiblePerson.trim() || "Equipe comercial",
    notes: notes.trim() || "Sem observações registradas.",
    diagnosis:
      status === "Planejada"
        ? "Campanha cadastrada para acompanhamento inicial."
        : "Campanha recém-cadastrada; aguarda entrada de métricas.",
    expectedLeads,
    referenceUrl: referenceUrl?.trim() || undefined,
    dailyMetrics: [{ date: startDate, leads: 0, clicks: 0, accesses: 0, views: 0 }],
    locationBreakdown: [
      {
        location: targetRegion.trim() || "Não informado",
        impressions: 0,
        clicks: 0,
        leads: 0,
      },
    ],
    createdAt: now,
    updatedAt: now,
    imobiliaria: agency,
  });
}

export function formatMarketingNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatMarketingCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMarketingPercent(value: number) {
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: value >= 10 ? 1 : 2,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  })}%`;
}

export function formatMarketingDateRange(startDate: string, endDate: string) {
  return `${shortDateLabel(startDate)} a ${shortDateLabel(endDate)}`;
}

export function getCampaignStrength(campaign: MarketingCampaign) {
  if (campaign.status === "Planejada") return "Aguardando início";
  if (campaign.status === "Com baixo desempenho") return "Requer atenção";
  if (campaign.costPerLead > 0 && campaign.costPerLead <= 45 && campaign.conversionRate >= 7) {
    return "Resultado forte";
  }
  if (campaign.conversionRate >= 8) return "Boa conversão";
  if (campaign.views > 0 && campaign.conversionRate < 4) return "Revisar criativo";
  if (campaign.status === "Pausada") return "Pausada para revisão";
  return "Desempenho estável";
}

function normalizeChannel(value?: string): MarketingChannel {
  const normalized = normalizeText(value ?? "");
  if (normalized.includes("instagram")) return "Instagram";
  if (normalized.includes("facebook")) return "Facebook";
  if (normalized.includes("google")) return "Google";
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("mail")) return "E-mail";
  if (normalized.includes("portal") || normalized.includes("portais")) return "Portal imobiliário";
  if (normalized.includes("open")) return "Open house";
  return "Externa";
}

function normalizeObjective(value?: string): MarketingObjective {
  const normalized = normalizeText(value ?? "");
  if (normalized.includes("visita")) return "Visitas";
  if (normalized.includes("capt")) return "Captação";
  if (normalized.includes("venda")) return "Venda";
  if (normalized.includes("loca")) return "Locação";
  if (normalized.includes("relacion")) return "Relacionamento";
  if (normalized.includes("reconhec")) return "Reconhecimento";
  return "Leads qualificados";
}

function normalizeStatus(value?: string): MarketingCampaignStatus {
  const normalized = normalizeText(value ?? "");
  if (normalized.includes("planej")) return "Planejada";
  if (normalized.includes("paus")) return "Pausada";
  if (normalized.includes("encerr")) return "Encerrada";
  if (normalized.includes("analise") || normalized.includes("analis")) return "Em análise";
  if (normalized.includes("baixo")) return "Com baixo desempenho";
  return "Ativa";
}

function getAutomaticDiagnosis(
  status: MarketingCampaignStatus,
  leads: number,
  accesses: number,
  investment: number,
) {
  if (status === "Planejada") return "Campanha planejada; aguarda início da veiculação.";
  if (leads === 0 && investment > 0) return "Investimento registrado sem leads gerados.";
  if (accesses > 0 && leads / accesses < 0.04) return "Alta visualização com baixa conversão.";
  if (leads > 0 && investment / leads <= 45) return "Boa geração de leads com CPL saudável.";
  return "Desempenho consistente para acompanhamento.";
}

function compareCampaignPerformance(first: MarketingCampaign, second: MarketingCampaign) {
  const firstScore = first.leads * 3 + first.conversionRate * 8 - first.costPerLead / 10;
  const secondScore = second.leads * 3 + second.conversionRate * 8 - second.costPerLead / 10;
  return secondScore - firstScore;
}

function buildFallbackDailyMetrics({
  endDate,
  leads,
  clicks,
  accesses,
  views,
}: {
  endDate: string;
  leads: number;
  clicks: number;
  accesses: number;
  views: number;
}): MarketingDailyMetric[] {
  const weights = [0.11, 0.14, 0.12, 0.17, 0.13, 0.18, 0.15];
  const dates = buildSevenDayWindow(endDate);
  const leadValues = splitByWeights(leads, weights);
  const clickValues = splitByWeights(clicks, weights);
  const accessValues = splitByWeights(accesses, weights);
  const viewValues = splitByWeights(views, weights);

  return dates.map((date, index) => ({
    date,
    leads: leadValues[index] ?? 0,
    clicks: clickValues[index] ?? 0,
    accesses: accessValues[index] ?? 0,
    views: viewValues[index] ?? 0,
  }));
}

function buildSevenDayWindow(endDate: string) {
  const end = parseDate(endDate) ?? parseDate(fallbackEndDate) ?? new Date(2026, 5, 30);
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(end, index - 6)));
}

function splitByWeights(total: number, weights: number[]) {
  const values = weights.map((weight) => Math.floor(total * weight));
  let remainder = total - values.reduce((sumValue, value) => sumValue + value, 0);
  let index = values.length - 1;

  while (remainder > 0) {
    values[index] += 1;
    remainder -= 1;
    index = index === 0 ? values.length - 1 : index - 1;
  }

  return values;
}

function isValidDailyMetrics(metrics: MarketingDailyMetric[]) {
  return metrics.every((metric) => Boolean(metric.date) && Number.isFinite(metric.leads));
}

function isValidLocations(locations: MarketingLocationBreakdown[]) {
  return locations.every((location) => Boolean(location.location));
}

function sum<T, K extends keyof T>(items: T[], key: K) {
  return items.reduce((total, item) => total + cleanNumber(item[key]), 0);
}

function sumDaily(metrics: MarketingDailyMetric[], key: keyof Omit<MarketingDailyMetric, "date">) {
  return metrics.reduce((total, metric) => total + metric[key], 0);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function getShortCampaignName(value: string) {
  return value
    .replace("Campanha ", "")
    .replace("Instagram - ", "Instagram ")
    .replace("Facebook - ", "Facebook ")
    .slice(0, 28);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function shortDateLabel(value: string) {
  const date = parseDate(value);
  if (!date) return "Sem data";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
