export type AdPlatform = "meta" | "google";
export type AdOAuthPurpose = "read" | "manage" | "leads";

export type AdErrorCode =
  | "not_configured"
  | "not_connected"
  | "token_expired"
  | "no_permission"
  | "campaign_not_found"
  | "rate_limited"
  | "invalid_link"
  | "provider_error"
  | "partial_data"
  | "conflict"
  | "invalid_parameter"
  | "outcome_uncertain";

export type AdRequestDiagnostics = {
  operation: "read" | "report" | "command";
  httpStatus?: number;
  providerCode?: number;
  providerSubcode?: number;
  requestId?: string;
  transient?: boolean;
  retryAfterSeconds?: number;
  usage?: { callCount?: number; cpuTime?: number; totalTime?: number; regainSeconds?: number };
};
export class AdProviderError extends Error {
  constructor(
    public code: AdErrorCode,
    message: string,
    public diagnostics?: AdRequestDiagnostics,
  ) {
    super(message);
    this.name = "AdProviderError";
  }
}

export type DateRange = { since: string; until: string };

export type DailyInsight = {
  date: string;
  impressions: number;
  reach: number | null;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  spend: number;
  /** Exact decimal for persistence when the provider supplies integer micros. */
  spendExact?: string;
  conversions?: number | null;
  leads: number;
  cpl: number;
  frequency: number | null;
  actions?: Array<{ action_type: string; value: string }>;
  leadActionType?: string;
  landingPageViews?: number;
};

export type ExternalCampaign = {
  id: string;
  name: string;
  status: "Ativa" | "Pausada" | "Encerrada" | "Planejada" | "Não identificado";
  objective?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
};

export type ParsedCampaignLink = {
  platform?: AdPlatform;
  accountId?: string;
  campaignId?: string;
  error?: string;
};

export interface AdProvider {
  platform: AdPlatform;
  parseLink?: (url: string) => ParsedCampaignLink;
  getCampaign(
    accountId: string | undefined,
    campaignId: string,
    token: string,
  ): Promise<ExternalCampaign>;
  getInsights(
    accountId: string | undefined,
    campaignId: string,
    range: DateRange,
    token: string,
  ): Promise<DailyInsight[]>;
}

export const AD_ERROR_MESSAGES: Record<AdErrorCode, string> = {
  not_configured: "Integração ainda não configurada.",
  not_connected: "Conta não conectada.",
  token_expired: "Conexão expirada. Conecte novamente.",
  no_permission: "Sem permissão para ler esta campanha.",
  campaign_not_found: "Campanha não encontrada nesta conta.",
  rate_limited: "Limite de consultas atingido. Tente em alguns minutos.",
  invalid_link: "Link não reconhecido.",
  provider_error: "A plataforma não respondeu como esperado.",
  partial_data: "Dados parciais. A sincronização precisa ser retomada.",
  invalid_parameter: "A plataforma recusou um parâmetro. Revise a configuração da operação.",
  outcome_uncertain: "Resultado não confirmado. Reconcilie na Meta antes de reenviar.",
  conflict: "Dados manuais ou vínculos em conflito. Reconcilie antes de sincronizar.",
};

export function finalizeInsight(
  d: Omit<DailyInsight, "ctr" | "cpc" | "cpm" | "cpl"> & Partial<DailyInsight>,
): DailyInsight {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    ...d,
    ctr: d.ctr ?? (d.impressions > 0 ? r2((d.clicks / d.impressions) * 100) : 0),
    cpc: d.cpc ?? (d.clicks > 0 ? r2(d.spend / d.clicks) : 0),
    cpm: d.cpm ?? (d.impressions > 0 ? r2((d.spend / d.impressions) * 1000) : 0),
    cpl: d.leads > 0 ? r2(d.spend / d.leads) : 0,
  };
}
