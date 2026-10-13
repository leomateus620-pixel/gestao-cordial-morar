import process from "node:process";
import { AdProviderError, finalizeInsight, type AdProvider, type DailyInsight, type ExternalCampaign } from "../types";

const API = "https://googleads.googleapis.com/v21";

async function search(customerId: string, query: string, token: string) {
  const devToken = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];
  if (!devToken) throw new AdProviderError("not_configured", "GOOGLE_ADS_DEVELOPER_TOKEN ausente");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  const login = process.env["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]?.replace(/-/g, "");
  if (login) headers["login-customer-id"] = login;
  const res = await fetch(`${API}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[google-ads]", res.status, text.slice(0, 500));
    if (res.status === 401) throw new AdProviderError("token_expired", text);
    if (res.status === 403) throw new AdProviderError("no_permission", text);
    if (res.status === 429 || text.includes("RESOURCE_EXHAUSTED")) throw new AdProviderError("rate_limited", text);
    if (res.status === 404) throw new AdProviderError("campaign_not_found", text);
    throw new AdProviderError("provider_error", text.slice(0, 300));
  }
  const batches = JSON.parse(text || "[]") as Array<{ results?: Array<Record<string, any>> }>;
  return batches.flatMap((b) => b.results ?? []);
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const micros = (v: unknown) => Math.round((n(v) / 1_000_000) * 100) / 100;

function mapStatus(s?: string): ExternalCampaign["status"] {
  if (s === "ENABLED") return "Ativa";
  if (s === "PAUSED") return "Pausada";
  if (s === "REMOVED") return "Encerrada";
  return "Planejada";
}

export const googleProvider: AdProvider = {
  platform: "google",
  async getCampaign(accountId, campaignId, token) {
    if (!accountId) throw new AdProviderError("invalid_link", "Conta Google Ads ausente");
    const rows = await search(
      accountId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${Number(campaignId)}`,
      token,
    );
    const c = rows[0]?.campaign;
    if (!c) throw new AdProviderError("campaign_not_found", "Campanha não encontrada");
    return { id: String(c.id), name: c.name, status: mapStatus(c.status), objective: c.advertisingChannelType };
  },
  async getInsights(accountId, campaignId, range, token) {
    if (!accountId) throw new AdProviderError("invalid_link", "Conta Google Ads ausente");
    const rows = await search(
      accountId,
      `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${Number(campaignId)} AND segments.date BETWEEN '${range.since}' AND '${range.until}'`,
      token,
    );
    return rows.map((r): DailyInsight => {
      const m = r.metrics ?? {};
      return finalizeInsight({
        date: r.segments?.date,
        impressions: n(m.impressions),
        reach: 0,
        frequency: 0,
        clicks: n(m.clicks),
        ctr: Math.round(n(m.ctr) * 10000) / 100,
        cpc: micros(m.averageCpc),
        cpm: micros(m.averageCpm),
        spend: micros(m.costMicros),
        leads: Math.round(n(m.conversions)),
      });
    });
  },
};
