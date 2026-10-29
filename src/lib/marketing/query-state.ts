import { z } from "zod";
import { comparisonRanges, currentCompetence } from "@/services/marketing-insights";

const marketingSearchObject = z.object({
  area: z.enum(["overview", "campaigns", "leads", "reports"]).catch("overview"),
  agency: z.enum(["todas", "cordial", "morar"]).optional(),
  competence: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .catch(() => currentCompetence()),
  since: z.iso.date().optional().catch(undefined),
  until: z.iso.date().optional().catch(undefined),
  search: z.string().max(100).catch(""),
  platform: z.enum(["", "meta", "google", "manual"]).catch(""),
  status: z.string().max(40).catch(""),
  accountId: z
    .string()
    .regex(/^(?:[0-9]{1,80})?$/)
    .catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
  leadStatus: z
    .enum(["", "queued", "processing", "unassigned", "imported", "review", "failed", "quarantined"])
    .catch(""),
  leadSearch: z.string().max(100).catch(""),
  leadFormId: z
    .string()
    .regex(/^(?:[0-9]{1,80})?$/)
    .catch(""),
  leadCampaignId: z.union([z.string().uuid(), z.literal("")]).catch(""),
  leadBrokerId: z.union([z.string().uuid(), z.literal("")]).catch(""),
  leadPage: z.coerce.number().int().min(1).max(10000).catch(1),
  sort: z.enum(["leads", "name", "updated"]).catch("leads"),
  googleSort: z
    .enum([
      "name_asc",
      "name_desc",
      "status_asc",
      "updated_desc",
      "cost_desc",
      "impressions_desc",
      "clicks_desc",
      "conversions_desc",
      "ctr_desc",
      "cpc_desc",
      "cost_per_conversion_desc",
    ])
    .optional()
    .catch(undefined),
  googleCampaignId: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .catch(undefined),
});
export const marketingSearchSchema = marketingSearchObject;
export type MarketingDashboardQuery = z.infer<typeof marketingSearchSchema>;
export function changeMarketingQuery(
  current: MarketingDashboardQuery,
  patch: Partial<MarketingDashboardQuery>,
): MarketingDashboardQuery {
  const resetCampaignPage = [
    "agency",
    "competence",
    "since",
    "until",
    "search",
    "platform",
    "status",
    "accountId",
    "googleSort",
  ].some(
    (key) =>
      key in patch && patch[key as keyof typeof patch] !== current[key as keyof typeof current],
  );
  const resetLeadPage = [
    "agency",
    "accountId",
    "platform",
    "competence",
    "since",
    "until",
    "leadStatus",
    "leadSearch",
    "leadFormId",
    "leadCampaignId",
    "leadBrokerId",
  ].some(
    (key) =>
      key in patch && patch[key as keyof typeof patch] !== current[key as keyof typeof current],
  );
  return marketingSearchSchema.parse({
    ...current,
    // An account identifier has meaning only within its platform. Never carry it
    // into a new platform implicitly, even when navigation originates outside the selector.
    ...(patch.platform !== undefined &&
    patch.platform !== current.platform &&
    patch.accountId === undefined
      ? { accountId: "" }
      : {}),
    ...(patch.platform === "google" && current.platform !== "google" && patch.status === undefined
      ? { status: "" }
      : {}),
    ...((patch.accountId !== undefined && patch.accountId !== current.accountId) ||
    (patch.agency !== undefined && patch.agency !== current.agency) ||
    (patch.platform !== undefined && patch.platform !== current.platform)
      ? { googleSort: undefined }
      : {}),
    ...(resetCampaignPage ? { page: 1 } : {}),
    ...(resetCampaignPage && current.googleCampaignId ? { googleCampaignId: "" } : {}),
    ...(resetLeadPage ? { leadPage: 1 } : {}),
    ...patch,
  });
}

export function marketingQueryRanges(
  query: Pick<MarketingDashboardQuery, "competence" | "since" | "until">,
  now = new Date(),
  timeZone = "America/Sao_Paulo",
) {
  if (query.since && query.until) {
    const from = Date.parse(`${query.since}T12:00:00Z`),
      to = Date.parse(`${query.until}T12:00:00Z`);
    const days = (to - from) / 86400000 + 1;
    if (days > 0 && days <= 367) {
      return {
        current: { since: query.since, until: query.until },
        previous: {
          since: new Date(from - days * 86400000).toISOString().slice(0, 10),
          until: new Date(from - 86400000).toISOString().slice(0, 10),
        },
      };
    }
  }
  return comparisonRanges(query.competence, now, timeZone);
}
