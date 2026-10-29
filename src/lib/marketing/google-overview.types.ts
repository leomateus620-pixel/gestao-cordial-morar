/** Serialized decimals stay strings so JSON cannot silently round monetary micros. */
export type GoogleMetricTotals = {
  cost: string | null;
  impressions: string | null;
  clicks: string | null;
  conversions: string | null;
  ctr: string | null;
  cpc: string | null;
  costPerConversion: string | null;
};
export type GoogleMarketingCoverage = "complete" | "partial" | "unavailable";
export type GoogleMarketingSort =
  | "name_asc"
  | "name_desc"
  | "status_asc"
  | "updated_desc"
  | "cost_desc"
  | "impressions_desc"
  | "clicks_desc"
  | "conversions_desc"
  | "ctr_desc"
  | "cpc_desc"
  | "cost_per_conversion_desc";
export type GoogleMarketingQuery = {
  agency?: "cordial" | "morar" | null;
  accountId?: string | null;
  since: string;
  until: string;
  search?: string;
  status?: string | null;
  page?: number;
  pageSize?: number;
  sort?: GoogleMarketingSort;
};
export type GoogleMarketingCampaign = {
  id: string;
  name: string;
  status: string;
  nativeStatus: string | null;
  channelType: string | null;
  channelSubtype: string | null;
  accountId: string | null;
  accountName: string | null;
  dataInicio: string;
  dataFim: string;
  agency: "cordial" | "morar";
  currency: string | null;
  timezone: string | null;
  lastCollectedAt: string | null;
  coverage: GoogleMarketingCoverage;
  metrics: GoogleMetricTotals;
  dailySeries: Array<{ date: string; metrics: GoogleMetricTotals }> | null;
};
export type GoogleMarketingOverview = {
  scope: {
    agency: "cordial" | "morar" | null;
    accountId: string | null;
    since: string;
    until: string;
  };
  coverage: GoogleMarketingCoverage;
  accounts: Array<{ id: string; name: string | null; agency: "cordial" | "morar" }>;
  accountName: string | null;
  currency: string | null;
  timezone: string | null;
  lastCollectedAt: string | null;
  summary: GoogleMetricTotals;
  series: Array<{ date: string; metrics: GoogleMetricTotals }> | null;
  items: GoogleMarketingCampaign[];
  total: number;
  page: number;
  pageSize: number;
  sort: GoogleMarketingSort;
};
