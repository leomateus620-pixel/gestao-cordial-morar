/** Browser-safe reporting contract. Decimal strings keep provider precision intact. */
export type InsightLevel = "campaign" | "adset" | "ad";
export type InsightGrain = "daily" | "period";
export type InsightBreakdown = "none" | "publisher_platform";
export type EntityInsightRow = {
  entityId: string;
  accountId: string;
  campaignId: string;
  adsetId: string | null;
  dateStart: string;
  dateStop: string;
  breakdown: Record<string, string>;
  impressions: string | null;
  clicks: string | null;
  inlineLinkClicks: string | null;
  spend: string | null;
  leads: string | null;
  leadActionType: string | null;
  reach: string | null;
  frequency: string | null;
  landingPageViews: string | null;
  attribution: string | null;
};
export type EntityInsightPage = {
  job: {
    id: string;
    status: string;
    progress: number;
    coverage: "pending" | "collected_data" | "collected_empty" | "partial" | "error";
    updatedAt: string;
    errorCode: string | null;
  } | null;
  snapshotJobId: string | null;
  snapshotAt: string | null;
  rows: EntityInsightRow[];
  total: number;
  financialVisible: boolean;
  currency: string | null;
  timezone: string | null;
  apiVersion: string | null;
  attributionRequested: Record<string, string | boolean> | null;
};
const decimalPattern = /^\d{1,20}(?:\.\d{1,10})?$/;
/** Missing values stay absent, and malformed provider values reject the whole page. */
export function insightDecimal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!decimalPattern.test(text)) throw new Error("invalid_metric");
  return text;
}
const id = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{1,80}$/.test(value)) throw new Error("invalid_entity");
  return value;
};
const date = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error("invalid_date");
  return value;
};
export function normalizeEntityInsight(
  raw: Record<string, unknown>,
  scope: {
    accountId: string;
    campaignId: string;
    level: InsightLevel;
    grain: InsightGrain;
    breakdown: InsightBreakdown;
    since: string;
    until: string;
    currency: string;
  },
): EntityInsightRow {
  if (
    id(raw.account_id) !== scope.accountId ||
    id(raw.campaign_id) !== scope.campaignId ||
    raw.account_currency !== scope.currency
  )
    throw new Error("scope_mismatch");
  const dateStart = date(raw.date_start),
    dateStop = date(raw.date_stop);
  if (
    dateStart < scope.since ||
    dateStop > scope.until ||
    dateStart > dateStop ||
    (scope.grain === "daily" && dateStart !== dateStop) ||
    (scope.grain === "period" && (dateStart !== scope.since || dateStop !== scope.until))
  )
    throw new Error("date_scope_mismatch");
  const actions = Array.isArray(raw.actions)
    ? raw.actions.filter(
        (a): a is { action_type: string; value: unknown } => a && typeof a.action_type === "string",
      )
    : [];
  const action = (type: string) => actions.find((a) => a.action_type === type);
  const lead = ["onsite_conversion.lead_grouped", "lead", "offsite_conversion.fb_pixel_lead"]
    .map(action)
    .find(Boolean);
  const platform = raw.publisher_platform;
  if (
    scope.breakdown === "publisher_platform" &&
    (typeof platform !== "string" || !/^[a-z_]{1,60}$/.test(platform))
  )
    throw new Error("invalid_breakdown");
  return {
    entityId: id(raw[`${scope.level}_id`]),
    accountId: scope.accountId,
    campaignId: scope.campaignId,
    adsetId: scope.level === "campaign" ? null : id(raw.adset_id),
    dateStart,
    dateStop,
    breakdown:
      scope.breakdown === "publisher_platform" ? { publisher_platform: platform as string } : {},
    impressions: insightDecimal(raw.impressions),
    clicks: insightDecimal(raw.clicks),
    inlineLinkClicks: insightDecimal(raw.inline_link_clicks),
    spend: insightDecimal(raw.spend),
    leads: lead ? insightDecimal(lead.value) : null,
    leadActionType: lead?.action_type ?? null,
    reach: scope.grain === "period" ? insightDecimal(raw.reach) : null,
    frequency: scope.grain === "period" ? insightDecimal(raw.frequency) : null,
    landingPageViews: insightDecimal(action("landing_page_view")?.value),
    attribution:
      typeof raw.attribution_setting === "string" ? raw.attribution_setting.slice(0, 200) : null,
  };
}
const scale = 10_000_000_000n;
function scaled(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(10, "0"));
}
function unscaled(value: bigint): string {
  return `${value / scale}.${String(value % scale).padStart(10, "0")}`.replace(/\.?0+$/, "");
}
export function sumInsightDecimals(values: Array<string | null>): string | null {
  if (!values.length || values.some((v) => v === null)) return null;
  return unscaled((values as string[]).reduce((sum, v) => sum + scaled(v), 0n));
}
function ratio(
  numerator: string | null,
  denominator: string | null,
  multiplier = 1,
): number | null {
  if (numerator === null || denominator === null || scaled(denominator) === 0n) return null;
  const value = (scaled(numerator) * BigInt(multiplier) * 1_000_000n) / scaled(denominator);
  const result = Number(value) / 1_000_000;
  return Number.isFinite(result) ? result : null;
}
/** Dashboard and reports can use the same weighted formulas; reach is never summed. */
export function entityInsightTotals(rows: EntityInsightRow[], currency: string | null) {
  const sum = (
    field: "impressions" | "clicks" | "inlineLinkClicks" | "spend" | "leads" | "landingPageViews",
  ) => sumInsightDecimals(rows.map((r) => r[field]));
  const impressions = sum("impressions"),
    clicks = sum("clicks"),
    spend = currency ? sum("spend") : null;
  const families = new Set(rows.map((r) => r.leadActionType));
  const leads = families.size === 1 && !families.has(null) ? sum("leads") : null;
  return {
    impressions,
    clicks,
    inlineLinkClicks: sum("inlineLinkClicks"),
    spend,
    leads,
    landingPageViews: sum("landingPageViews"),
    ctr: ratio(clicks, impressions, 100),
    cpc: ratio(spend, clicks),
    cpm: ratio(spend, impressions, 1000),
    cpl: ratio(spend, leads),
    reach: rows.length === 1 ? rows[0].reach : null,
    frequency: rows.length === 1 ? rows[0].frequency : null,
    leadActionType: families.size === 1 ? (rows[0]?.leadActionType ?? null) : null,
  };
}
