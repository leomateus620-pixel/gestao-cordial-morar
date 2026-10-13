import { AdProviderError, finalizeInsight, type AdProvider, type DailyInsight, type ExternalCampaign } from "../types";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } } & T;
  if (!res.ok || body.error) {
    const code = body.error?.code;
    const msg = body.error?.message ?? `HTTP ${res.status}`;
    console.error("[meta-ads]", res.status, msg);
    if (code === 190) throw new AdProviderError("token_expired", msg);
    if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429)
      throw new AdProviderError("rate_limited", msg);
    if (code === 10 || code === 200 || code === 294 || res.status === 403)
      throw new AdProviderError("no_permission", msg);
    if (code === 100 || res.status === 404) throw new AdProviderError("campaign_not_found", msg);
    throw new AdProviderError("provider_error", msg);
  }
  return body;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const LEAD_ACTIONS = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);

function mapStatus(s?: string): ExternalCampaign["status"] {
  if (s === "ACTIVE") return "Ativa";
  if (s === "PAUSED") return "Pausada";
  if (s === "ARCHIVED" || s === "DELETED") return "Encerrada";
  return "Planejada";
}

export const metaProvider: AdProvider = {
  platform: "meta",
  async getCampaign(_accountId, campaignId, token) {
    const c = await graph<{ id: string; name: string; status?: string; objective?: string; start_time?: string; stop_time?: string }>(
      `/${campaignId}`,
      token,
      { fields: "name,status,objective,start_time,stop_time" },
    );
    return {
      id: c.id,
      name: c.name,
      status: mapStatus(c.status),
      objective: c.objective,
      startDate: c.start_time?.slice(0, 10),
      endDate: c.stop_time?.slice(0, 10),
    };
  },
  async getInsights(_accountId, campaignId, range, token) {
    const out: DailyInsight[] = [];
    type Row = Record<string, unknown> & { actions?: Array<{ action_type: string; value: string }> };
    let page = await graph<{ data: Row[]; paging?: { next?: string } }>(`/${campaignId}/insights`, token, {
      time_increment: "1",
      time_range: JSON.stringify(range),
      fields: "impressions,reach,clicks,ctr,cpc,cpm,spend,frequency,actions",
      limit: "100",
    });
    for (let i = 0; i < 10; i++) {
      for (const r of page.data ?? []) {
        // Meta returns the same action under several aliases; take the largest to avoid double counting.
        const leads = Math.max(0, ...(r.actions ?? []).filter((a) => LEAD_ACTIONS.has(a.action_type)).map((a) => num(a.value)));
        out.push(
          finalizeInsight({
            date: String(r.date_start),
            impressions: num(r.impressions),
            reach: num(r.reach),
            clicks: num(r.clicks),
            spend: num(r.spend),
            frequency: num(r.frequency),
            ctr: num(r.ctr),
            cpc: num(r.cpc),
            cpm: num(r.cpm),
            leads,
          }),
        );
      }
      const next = page.paging?.next;
      if (!next) break;
      const res = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      page = (await res.json()) as typeof page;
    }
    return out;
  },
};
