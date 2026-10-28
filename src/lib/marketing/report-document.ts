import type { MarketingReportSnapshot } from "./report-model";

/** PDF presentation contract accepts missing metrics without converting them to zero. */
export type MarketingReportDocument = Omit<MarketingReportSnapshot, "kpis" | "trend" | "rows"> & {
  rows: Array<Omit<MarketingReportSnapshot["rows"][number], "status"> & { status: string }>;
  kpis: Omit<MarketingReportSnapshot["kpis"], "leads" | "clicks" | "impressions"> & {
    leads: number | null;
    clicks: number | null;
    impressions: number | null;
  };
  trend: Array<
    Omit<MarketingReportSnapshot["trend"][number], "leads" | "clicks"> & {
      leads: number | null;
      clicks: number | null;
    }
  >;
  entity?: {
    snapshotJobId: string;
    campaignId: string;
    level: "campaign" | "adset" | "ad";
    grain: "daily" | "period";
    breakdown: "none" | "publisher_platform";
    apiVersion: string;
    completedAt: string;
  };
};
