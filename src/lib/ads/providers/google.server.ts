import process from "node:process";
import { externalId, normalizeAccountId } from "../meta.graph.server";
import {
  AdProviderError,
  finalizeInsight,
  type AdProvider,
  type DailyInsight,
  type ExternalCampaign,
} from "../types";

const API = "https://googleads.googleapis.com/v21";

async function search(customerId: string, query: string, token: string) {
  customerId = normalizeAccountId(customerId.replace(/-/g, ""));
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
    signal: AbortSignal.timeout(15_000),
    headers,
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) throw new AdProviderError("token_expired", "Conexão Google expirada.");
    if (res.status === 403) throw new AdProviderError("no_permission", "Sem permissão Google Ads.");
    if (res.status === 429 || text.includes("RESOURCE_EXHAUSTED"))
      throw new AdProviderError("rate_limited", "Limite Google Ads atingido.");
    if (res.status === 404)
      throw new AdProviderError("campaign_not_found", "Campanha não encontrada.");
    throw new AdProviderError("provider_error", "Falha do Google Ads.");
  }
  const batches = JSON.parse(text || "[]") as Array<{
    results?: Array<Record<string, Record<string, string>>>;
  }>;
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
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${externalId(campaignId)}`,
      token,
    );
    const c = rows[0]?.campaign;
    if (!c) throw new AdProviderError("campaign_not_found", "Campanha não encontrada");
    return {
      id: String(c.id),
      name: c.name,
      status: mapStatus(c.status),
      objective: c.advertisingChannelType,
    };
  },
  async getInsights(accountId, campaignId, range, token) {
    if (!accountId) throw new AdProviderError("invalid_link", "Conta Google Ads ausente");
    const rows = await search(
      accountId,
      `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${externalId(campaignId)} AND segments.date BETWEEN '${range.since}' AND '${range.until}'`,
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

export async function getGoogleAccount(accountId: string, token: string) {
  const rows = await search(
    accountId,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
    token,
  );
  const customer = rows[0]?.customer;
  if (!customer || String(customer.id) !== normalizeAccountId(accountId))
    throw new AdProviderError("no_permission", "Conta Google não vinculada.");
  return {
    account_id: String(customer.id),
    name: String(customer.descriptiveName ?? accountId),
    currency: String(customer.currencyCode),
    timezone: String(customer.timeZone),
  };
}
