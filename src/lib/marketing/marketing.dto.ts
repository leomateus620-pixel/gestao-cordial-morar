import type {
  MarketingAgencyId,
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingChannel,
  MarketingDailyMetric,
  MarketingObjective,
} from "@/types/marketing";
export type CampaignRow = {
  id: string;
  user_id: string;
  imobiliaria: string;
  nome: string;
  canal: string;
  objetivo: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  investimento: number | string | null;
  responsavel: string | null;
  observacoes: string | null;
  diagnostico: string | null;
  referencia_url: string | null;
  leads_esperados: number | null;
  created_at: string;
  updated_at: string;
  platform?: string | null;
  external_campaign_id?: string | null;
  external_account_id?: string | null;
  source_url?: string | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  sync_error?: string | null;
  connection_id?: string | null;
  currency?: string | null;
  account_timezone?: string | null;
  daily_metrics?: DailyRow[];
  period_insights?: MarketingCampaign["periodAggregate"];
  timezone?: string | null;
};
export type DailyRow = {
  data: string;
  leads?: number;
  clicks?: number;
  accesses?: number;
  views?: number;
  investimento?: number | string | null;
  impressions?: number | string | null;
  reach?: number | string | null;
  frequency?: number | string | null;
  spend?: number | string | null;
  cpc?: number | string | null;
  cpm?: number | string | null;
  ctr?: number | string | null;
  conversions?: number | string | null;
  landing_page_views?: number | string | null;
};
const numeric = (v: unknown) =>
  v === null || v === undefined ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined;

function dailyDto(row: DailyRow, financial: boolean): MarketingDailyMetric {
  return {
    date: row.data,
    leads: row.leads ?? 0,
    clicks: row.clicks ?? 0,
    accesses: row.accesses ?? 0,
    views: row.views ?? 0,
    impressions: numeric(row.impressions),
    reach: numeric(row.reach),
    frequency: numeric(row.frequency),
    ctr: numeric(row.ctr),
    conversions: numeric(row.conversions),
    landingPageViews: numeric(row.landing_page_views),
    ...(financial
      ? {
          spend: numeric(row.spend) ?? numeric(row.investimento),
          cpc: numeric(row.cpc),
          cpm: numeric(row.cpm),
        }
      : {}),
  };
}
function campaignSource(row: CampaignRow): string | null {
  if (!row.external_campaign_id || !/^[0-9]+$/.test(row.external_campaign_id)) return null;
  const account = row.external_account_id?.replace(/^act_/, "");
  if (account && !/^[0-9]+$/.test(account)) return null;
  if (row.platform === "meta")
    return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${row.external_campaign_id}${account ? `&act=${account}` : ""}`;
  if (row.platform === "google")
    return `https://ads.google.com/aw/campaigns?campaignId=${row.external_campaign_id}${account ? `&customerId=${account}` : ""}`;
  return null;
}
export function marketingCampaignDto(row: CampaignRow, financial: boolean): MarketingCampaign {
  const dailyMetrics = (row.daily_metrics ?? [])
    .map((d) => dailyDto(d, financial))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sum = (key: "leads" | "clicks" | "accesses" | "views" | "impressions") =>
    dailyMetrics.reduce((s, d) => s + (d[key] ?? 0), 0);
  const leads = sum("leads"),
    accesses = sum("accesses");
  const investment = financial ? (numeric(row.investimento) ?? 0) : null;
  return {
    id: row.id,
    name: row.nome,
    channel: row.canal as MarketingChannel,
    objective: row.objetivo as MarketingObjective,
    status: row.status as MarketingCampaignStatus,
    startDate: row.data_inicio,
    endDate: row.data_fim,
    investment,
    leads,
    clicks: sum("clicks"),
    accesses,
    views: sum("views"),
    impressions: sum("impressions"),
    conversionRate: accesses > 0 ? Math.round((leads / accesses) * 10000) / 100 : 0,
    costPerLead:
      investment !== null && leads > 0 ? Math.round((investment / leads) * 100) / 100 : null,
    bestLocation: "Não informado",
    responsiblePerson: row.responsavel ?? "",
    notes: row.observacoes ?? "",
    diagnosis: row.diagnostico ?? "",
    expectedLeads: row.leads_esperados ?? undefined,
    referenceUrl: row.referencia_url ?? undefined,
    dailyMetrics,
    locationBreakdown: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imobiliaria: row.imobiliaria as MarketingAgencyId,
    platform: (row.platform as MarketingCampaign["platform"]) ?? null,
    externalCampaignId: row.external_campaign_id ?? null,
    externalAccountId: row.external_account_id ?? null,
    sourceUrl: campaignSource(row),
    lastSyncedAt: row.last_synced_at ?? null,
    syncStatus: (row.sync_status as MarketingCampaign["syncStatus"]) ?? "manual",
    syncError: row.sync_error ?? null,
    connectionId: row.connection_id ?? null,
    currency: row.currency ?? (row.platform ? null : "BRL"),
    accountTimezone: row.account_timezone ?? row.timezone ?? null,
    financialVisible: financial,
    periodAggregate: row.period_insights ?? null,
  };
}
