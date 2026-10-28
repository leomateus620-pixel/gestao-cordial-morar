import {
  AdProviderError,
  finalizeInsight,
  type AdProvider,
  type ExternalCampaign,
  type DateRange,
} from "../types";
import { externalId, metaGraph, metaPages, normalizeAccountId } from "../meta.graph.server";

function metric(v: unknown, required = true): number | null {
  const parsed =
    typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
    if (required)
      throw new AdProviderError(
        "partial_data",
        "Métrica obrigatória ausente ou inválida; dados anteriores preservados.",
      );
    return null;
  }
  return parsed;
}
const num = (v: unknown) => metric(v)!;
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
  return "Não identificado";
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
      fields: "reach,frequency,impressions,spend",
      time_increment: "all_days",
      use_unified_attribution_setting: "true",
    },
  );
  if (rows.length > 1)
    throw new AdProviderError("partial_data", "Agregado de período retornou grão inesperado.");
  return {
    since: range.since,
    until: range.until,
    accountId: normalizeAccountId(accountId),
    campaignId,
    reach: rows[0] ? metric(rows[0].reach, false) : null,
    frequency: rows[0] ? metric(rows[0].frequency, false) : null,
    impressions: rows[0] ? num(rows[0].impressions) : 0,
    spend: rows[0] ? num(rows[0].spend) : 0,
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
    const seen = new Set<string>();
    return rows.map((r) => {
      const date = String(r.date_start ?? "");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < range.since ||
        date > range.until ||
        seen.has(date)
      )
        throw new AdProviderError("partial_data", "Série diária incompleta ou duplicada.");
      seen.add(date);
      const actions = r.actions ?? [];
      const lead = selectLeadAction(actions);
      return finalizeInsight({
        date: String(r.date_start),
        impressions: num(r.impressions),
        reach: metric(r.reach, false),
        clicks: num(r.clicks),
        spend: num(r.spend),
        frequency: metric(r.frequency, false),
        leads: lead.leads,
        leadActionType: lead.type,
        actions,
        landingPageViews:
          metric(actions.find((a) => a.action_type === "landing_page_view")?.value, false) ??
          undefined,
      });
    });
  },
};
