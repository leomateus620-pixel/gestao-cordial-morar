import type { SiteBrand } from "@/lib/cordial-site/brand";

export type AudiencePeriod = "day" | "week" | "month";
export type AudienceView = "overview" | "origins" | "pages";
export type AudiencePropertyOrder = "views" | "clicks";
export const MAX_AUDIENCE_OFFSET = 90;

export type AudienceReportInput = {
  brand: SiteBrand;
  period: AudiencePeriod;
  offset: number;
  view: AudienceView;
};

export type AudienceTotals = {
  visitors: number;
  sessions: number;
  views: number;
  propertyViews?: number;
  propertyClicks?: number;
  menuClicks?: number;
};

export type AudienceRankItem = {
  /** Normalized route or menu key, never a visitor's URL. */
  key: string;
  count: number;
};

export type AudiencePropertyRank = {
  publicId: string;
  /** Latest public catalog information. Null if the item is no longer public. */
  listing: { name: string; code: string | null; coverUrl: string | null; url: string } | null;
  views: number;
  clicks: number;
  sessions: number | null;
  reopens: number | null;
  returnSessions: number | null;
  whatsapp: number | null;
  forms: number | null;
  previews: number | null;
};

export type AudienceRatio = { count: number; sample: number };

export type AudienceBehavior = {
  quickExits: AudienceRatio | null;
  activeTime: { medianSeconds: number; sample: number; total: number } | null;
  multipleProperties: AudienceRatio | null;
  sameSessionReopen: AudienceRatio | null;
  laterSessionReturn: AudienceRatio | null;
  searchToSecondProperty: AudienceRatio | null;
  propertyToWhatsapp: AudienceRatio | null;
  forms: AudienceRatio | null;
};

export type AudienceChannel = "organic" | "paid" | "social" | "referral" | "direct" | "campaign";
export type AudienceOrigin = {
  channel: AudienceChannel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  entryPage: string;
  sessions: number;
  propertySessions: number | null;
  contactSessions: number | null;
};

export type AudienceOverview = {
  totals: AudienceTotals;
  previous: AudienceTotals | null;
  today: AudienceTotals | null;
  week: AudienceTotals | null;
  trend: { start: string; views: number | null }[];
  properties: Record<AudiencePropertyOrder, AudiencePropertyRank[]>;
  pages: AudienceRankItem[];
  menus: AudienceRankItem[];
  behavior: AudienceBehavior;
};

type AudienceReportBase = {
  brand: SiteBrand;
  period: AudiencePeriod;
  offset: number;
  from: string;
  /** End of the calendar period (exclusive), represented in ISO 8601. */
  to: string;
  asOf: string;
  /** Most recent event received for this brand/environment. */
  lastEventAt: string | null;
  collectionSince: string | null;
  collectionEnabled: boolean;
  partial: boolean;
  environment: "production" | "qa";
};

export type AudienceReport =
  | { status: "unauthorized" }
  | (AudienceReportBase & { status: "disabled" | "unavailable" })
  | (AudienceReportBase & { status: "ready" } & (
        | { view: "overview"; overview: AudienceOverview }
        | {
            view: "origins";
            origins: AudienceOrigin[];
            withheldSessions: number;
            totalSessions: number;
          }
        | { view: "pages"; pages: AudienceRankItem[]; menus: AudienceRankItem[] }
      ));
