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
});
/** A restored Leads URL must apply the same Meta scope as entering through the tab. */
export const marketingSearchSchema = marketingSearchObject.transform((query) => {
  if (query.area !== "leads") return query;
  const incompatible =
    query.platform === "google" ||
    query.platform === "manual" ||
    (query.platform !== "meta" && Boolean(query.accountId));
  return {
    ...query,
    platform: "meta" as const,
    ...(incompatible ? { accountId: "", page: 1, leadPage: 1 } : {}),
  };
});
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
  ].some(
    (key) =>
      key in patch && patch[key as keyof typeof patch] !== current[key as keyof typeof current],
  );
  const resetLeadPage = [
    "agency",
    "accountId",
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
    ...(resetCampaignPage ? { page: 1 } : {}),
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
