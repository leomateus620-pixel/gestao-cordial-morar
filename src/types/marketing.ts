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
  "Todos" | "Instagram" | "Facebook" | "Google" | "WhatsApp" | "E-mail" | "Externa";

export type MarketingCampaignStatus =
  "Ativa" | "Planejada" | "Pausada" | "Encerrada" | "Em análise" | "Com baixo desempenho";

export type MarketingStatusFilter =
  "Todas" | "Ativa" | "Planejada" | "Pausada" | "Encerrada" | "Com baixo desempenho";

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
};

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
>;
