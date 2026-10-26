import {
  AdProviderError,
  finalizeInsight,
  type AdProvider,
  type ExternalCampaign,
  type DateRange,
} from "../types";
import { externalId, metaGraph, metaPages, normalizeAccountId } from "../meta.graph.server";

const num = (v: unknown) => Number(v ?? 0) || 0;
type Action = { action_type: string; value: string };
// One documented reporting family, never add overlapping aliases or take their maximum.
// Prefer the explicit instant-form family; the generic `lead` is only a fallback.
export function selectLeadAction(actions: Action[]): { leads: number; type?: string } {
  for (const type of [
    "onsite_conversion.lead_grouped",
    "lead",
    "offsite_conversion.fb_pixel_lead",
  ]) {
    const action = actions.find((a) => a.action_type === type);
    if (action) return { leads: num(action.value), type };
  }
  return { leads: 0 };
}
function mapStatus(s?: string): ExternalCampaign["status"] {
  if (s === "ACTIVE") return "Ativa";
  if (s === "PAUSED") return "Pausada";
  if (s === "ARCHIVED" || s === "DELETED") return "Encerrada";
  return "Planejada";
}
type Campaign = {
  id: string;
  account_id: string;
  name: string;
  status?: string;
  objective?: string;
  start_time?: string;
  stop_time?: string;
};
const fields = "id,account_id,name,status,objective,start_time,stop_time";
const mapCampaign = (c: Campaign): ExternalCampaign => ({
  id: c.id,
  accountId: c.account_id,
  name: c.name,
  status: mapStatus(c.status),
  objective: c.objective,
  startDate: c.start_time?.slice(0, 10),
  endDate: c.stop_time?.slice(0, 10),
});
export type MetaAccount = {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
};
export async function getMetaAccount(accountId: string, token: string) {
  return metaGraph<MetaAccount>(`/act_${normalizeAccountId(accountId)}`, token, {
    fields: "id,account_id,name,currency,timezone_name",
  });
}
export async function discoverMetaAccounts(token: string) {
  return metaPages<MetaAccount>("/me/adaccounts", token, {
    fields: "id,account_id,name,currency,timezone_name",
  });
}
export async function discoverMetaCampaigns(accountId: string, token: string) {
  return (
    await metaPages<Campaign>(`/act_${normalizeAccountId(accountId)}/campaigns`, token, { fields })
  ).map(mapCampaign);
}
export async function getMetaPeriodInsight(
  accountId: string,
  campaignId: string,
  range: DateRange,
  token: string,
) {
  // Same campaign, account, dates and attribution as the daily series; reach is unique ONLY in this scope.
  await metaProvider.getCampaign(accountId, campaignId, token);
  const rows = await metaPages<Record<string, string>>(
    `/${externalId(campaignId)}/insights`,
    token,
    {
      time_range: JSON.stringify(range),
      fields: "reach,frequency,impressions",
      time_increment: "all_days",
      use_unified_attribution_setting: "true",
    },
  );
  return {
    since: range.since,
    until: range.until,
    accountId: normalizeAccountId(accountId),
    campaignId,
    reach: rows[0] ? num(rows[0].reach) : null,
    frequency: rows[0] ? num(rows[0].frequency) : null,
    scope: "campaign" as const,
  };
}
export const metaProvider: AdProvider = {
  platform: "meta",
  async getCampaign(accountId, campaignId, token) {
    if (!accountId) throw new AdProviderError("invalid_link", "Selecione a conta de anúncios.");
    const c = await metaGraph<Campaign>(`/${externalId(campaignId)}`, token, { fields });
    if (normalizeAccountId(c.account_id) !== normalizeAccountId(accountId))
      throw new AdProviderError("no_permission", "Campanha de outra conta.");
    return mapCampaign(c);
  },
  async getInsights(accountId, campaignId, range, token) {
    await this.getCampaign(accountId, campaignId, token);
    type Row = Record<string, unknown> & { actions?: Action[] };
    const rows = await metaPages<Row>(`/${externalId(campaignId)}/insights`, token, {
      time_increment: "1",
      time_range: JSON.stringify(range),
      fields: "impressions,reach,clicks,spend,frequency,actions",
      use_unified_attribution_setting: "true",
    });
    return rows.map((r) => {
      const actions = r.actions ?? [];
      const lead = selectLeadAction(actions);
      return finalizeInsight({
        date: String(r.date_start),
        impressions: num(r.impressions),
        reach: num(r.reach),
        clicks: num(r.clicks),
        spend: num(r.spend),
        frequency: num(r.frequency),
        leads: lead.leads,
        leadActionType: lead.type,
        actions,
        landingPageViews: num(actions.find((a) => a.action_type === "landing_page_view")?.value),
      });
    });
  },
};
