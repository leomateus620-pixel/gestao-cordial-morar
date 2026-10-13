export type MarketingAgencyId = "cordial" | "morar";

export type MarketingChannel =
  | "Instagram"
  | "Facebook"
  | "Google"
  | "WhatsApp"
  | "E-mail"
  | "Portal imobiliário"
  | "Open house"
  | "Externa";

export type MarketingChannelFilter =
  | "Todos"
  | "Instagram"
  | "Facebook"
  | "Google"
  | "WhatsApp"
  | "E-mail"
  | "Externa";

export type MarketingCampaignStatus =
  | "Ativa"
  | "Planejada"
  | "Pausada"
  | "Encerrada"
  | "Em análise"
  | "Com baixo desempenho";

export type MarketingStatusFilter =
  | "Todas"
  | "Ativa"
  | "Planejada"
  | "Pausada"
  | "Encerrada"
  | "Em análise"
  | "Com baixo desempenho";

export type MarketingObjective =
  | "Leads qualificados"
  | "Visitas"
  | "Captação"
  | "Venda"
  | "Locação"
  | "Relacionamento"
  | "Reconhecimento";

export type MarketingDailyMetric = {
  date: string;
  leads: number;
  clicks: number;
  views: number;
  accesses: number;
  impressions?: number;
  reach?: number;
  frequency?: number;
  spend?: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
  conversions?: number;
};

export type MarketingPlatform = "meta" | "google";
export type MarketingSyncStatus = "manual" | "synced" | "error";

export type MarketingLocationBreakdown = {
  location: string;
  impressions: number;
  clicks: number;
  leads: number;
};

export type MarketingCampaign = {
  id: string;
  name: string;
  channel: MarketingChannel;
  objective: MarketingObjective;
  status: MarketingCampaignStatus;
  startDate: string;
  endDate: string;
  investment: number;
  leads: number;
  clicks: number;
  accesses: number;
  views: number;
  impressions: number;
  conversionRate: number;
  costPerLead: number;
  bestLocation: string;
  responsiblePerson: string;
  notes: string;
  diagnosis: string;
  expectedLeads?: number;
  referenceUrl?: string;
  dailyMetrics: MarketingDailyMetric[];
  locationBreakdown: MarketingLocationBreakdown[];
  createdAt: string;
  updatedAt: string;
  imobiliaria: MarketingAgencyId;
  platform?: MarketingPlatform | null;
  externalCampaignId?: string | null;
  externalAccountId?: string | null;
  sourceUrl?: string | null;
  lastSyncedAt?: string | null;
  syncStatus?: MarketingSyncStatus;
  syncError?: string | null;
};

export type MarketingCampaignInput = Omit<
  MarketingCampaign,
  | "id"
  | "leads"
  | "clicks"
  | "accesses"
  | "views"
  | "impressions"
  | "conversionRate"
  | "costPerLead"
  | "bestLocation"
  | "diagnosis"
  | "dailyMetrics"
  | "locationBreakdown"
  | "createdAt"
  | "updatedAt"
  | "platform"
  | "externalCampaignId"
  | "externalAccountId"
  | "sourceUrl"
  | "lastSyncedAt"
  | "syncStatus"
  | "syncError"
>;
