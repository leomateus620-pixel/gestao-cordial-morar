import process from "node:process";
import {
  AdProviderError,
  finalizeInsight,
  type AdProvider,
  type DailyInsight,
  type ExternalCampaign,
} from "../types";

// Only v26 has been reviewed against this adapter's read-only field catalog.
export function googleAdsApiVersion(): string {
  const version = process.env["GOOGLE_ADS_API_VERSION"] ?? "v26";
  if (version !== "v26")
    throw new AdProviderError("not_configured", "Versão Google Ads não validada.");
  return version;
}

export function googleCustomerId(value: string): string {
  const id = value.replace(/-/g, "");
  if (!/^\d{10}$/.test(id) || !/^(?:\d{10}|\d{3}-\d{3}-\d{4})$/.test(value))
    throw new AdProviderError("invalid_link", "Customer ID Google inválido.");
  return id;
}

function campaignId(value: string): string {
  if (!/^\d{1,20}$/.test(value))
    throw new AdProviderError("invalid_link", "Identificador de campanha Google inválido.");
  return value;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

type Row = Record<string, Record<string, string>>;
const MAX_PAGE_BYTES = 5_000_000;
const MAX_ROWS = 10_000;
const MAX_PAGES = 100;

async function readBounded(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAGE_BYTES) {
        await reader.cancel();
        throw new AdProviderError("partial_data", "Resposta Google excedeu o limite seguro.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// Catalog queries are constructed on the server; Search pages are bounded and
// an incomplete response never reaches ad_sync_commit.
async function search(account: string, query: string, token: string): Promise<Row[]> {
  const customerId = googleCustomerId(account);
  const version = googleAdsApiVersion();
  const rows: Row[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(
        `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          redirect: "manual",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
        },
      );
    } catch {
      throw new AdProviderError("provider_error", "Não foi possível consultar o Google Ads.", {
        operation: "read",
        transient: true,
      });
    }
    const text = await readBounded(res);
    if (!res.ok) {
      const diagnostics = {
        operation: "read" as const,
        httpStatus: res.status,
        requestId: res.headers.get("request-id") ?? undefined,
        transient: res.status === 429 || res.status >= 500,
      };
      if (res.status === 401)
        throw new AdProviderError("token_expired", "Conexão Google expirada.", diagnostics);
      if (res.status === 429 || text.includes("RESOURCE_EXHAUSTED"))
        throw new AdProviderError("rate_limited", "Limite Google Ads atingido.", diagnostics);
      if (res.status === 403)
        throw new AdProviderError(
          "no_permission",
          "Sem acesso à conta ou ao Google Ads no projeto Cloud.",
          diagnostics,
        );
      if (res.status === 404)
        throw new AdProviderError(
          "campaign_not_found",
          "Recurso Google Ads não encontrado.",
          diagnostics,
        );
      if (res.status === 400)
        throw new AdProviderError(
          "invalid_parameter",
          "Consulta Google Ads recusada.",
          diagnostics,
        );
      throw new AdProviderError("provider_error", "Falha do Google Ads.", diagnostics);
    }
    let body: { results?: Row[]; nextPageToken?: string };
    try {
      body = JSON.parse(text);
    } catch {
      throw new AdProviderError("partial_data", "Resposta Google inválida.");
    }
    if (
      !body ||
      typeof body !== "object" ||
      (body.results !== undefined && !Array.isArray(body.results)) ||
      (body.nextPageToken !== undefined && typeof body.nextPageToken !== "string")
    )
      throw new AdProviderError("partial_data", "Resposta Google incompleta.");
    rows.push(...(body.results ?? []));
    if (rows.length > MAX_ROWS)
      throw new AdProviderError("partial_data", "Consulta Google excedeu o limite seguro.");
    pageToken = body.nextPageToken;
    if (!pageToken) return rows;
    if (seenTokens.has(pageToken))
      throw new AdProviderError("partial_data", "Paginação Google repetida.");
    seenTokens.add(pageToken);
  }
  throw new AdProviderError("partial_data", "Paginação Google incompleta.");
}

function safeInteger(value: unknown): number {
  if (value == null) return 0; // Google protobuf JSON omits scalar default values.
  if (!/^\d+$/.test(String(value)))
    throw new AdProviderError("partial_data", "Métrica Google inválida.");
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new AdProviderError("partial_data", "Métrica Google excede a precisão suportada.");
  return result;
}
// The field is explicitly selected in GAQL; protobuf JSON omits its zero default.
function finite(value: unknown): number {
  if (value == null) return 0;
  const result = Number(value);
  if (!Number.isFinite(result))
    throw new AdProviderError("partial_data", "Métrica Google inválida.");
  return result;
}
// Keep the monetary value exact as a decimal string for PostgreSQL numeric.
export function microsDecimal(value: unknown): string {
  if (value == null) return "0";
  const raw = String(value);
  if (!/^\d{1,19}$/.test(raw)) throw new AdProviderError("partial_data", "Custo Google inválido.");
  const micros = BigInt(raw);
  return `${micros / 1000000n}.${String(micros % 1000000n).padStart(6, "0")}`;
}

function mapStatus(s?: string): ExternalCampaign["status"] {
  if (s === "ENABLED") return "Ativa";
  if (s === "PAUSED") return "Pausada";
  if (s === "REMOVED") return "Encerrada";
  return "Não identificado";
}

export const googleProvider: AdProvider = {
  platform: "google",
  async getCampaign(accountId, id, token) {
    if (!accountId) throw new AdProviderError("invalid_link", "Conta Google Ads ausente");
    const rows = await search(
      accountId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${campaignId(id)}`,
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
  async getInsights(accountId, id, range, token) {
    if (!accountId) throw new AdProviderError("invalid_link", "Conta Google Ads ausente");
    if (!validDate(range.since) || !validDate(range.until) || range.since > range.until)
      throw new AdProviderError("invalid_parameter", "Período Google inválido.");
    const rows = await search(
      accountId,
      `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${campaignId(id)} AND segments.date BETWEEN '${range.since}' AND '${range.until}'`,
      token,
    );
    return rows.map((r): DailyInsight => {
      const m = r.metrics ?? {};
      if (!r.segments?.date || !validDate(r.segments.date))
        throw new AdProviderError("partial_data", "Data de métrica Google ausente.");
      const spendExact = microsDecimal(m.costMicros);
      const spend = Number(spendExact);
      if (!Number.isSafeInteger(Number(m.costMicros ?? 0)))
        throw new AdProviderError("partial_data", "Custo Google excede a precisão da interface.");
      return finalizeInsight({
        date: r.segments.date,
        impressions: safeInteger(m.impressions),
        reach: null,
        frequency: null,
        clicks: safeInteger(m.clicks),
        spend,
        spendExact,
        leads: 0,
        conversions: finite(m.conversions),
      });
    });
  },
};

export async function getGoogleAccount(accountId: string, token: string) {
  const rows = await search(
    accountId,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer LIMIT 1",
    token,
  );
  const customer = rows[0]?.customer;
  if (!customer || String(customer.id) !== googleCustomerId(accountId))
    throw new AdProviderError("no_permission", "Conta Google não vinculada.");
  return {
    account_id: String(customer.id),
    name: String(customer.descriptiveName ?? accountId),
    currency: String(customer.currencyCode),
    timezone: String(customer.timeZone),
    manager: String(customer.manager ?? "false") === "true",
    testAccount: String(customer.testAccount ?? "false") === "true",
  };
}

/** Directly accessible customers only. Manager hierarchies require a stored login route. */
export async function discoverGoogleAccounts(token: string) {
  const version = googleAdsApiVersion();
  let res: Response;
  try {
    res = await fetch(
      `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new AdProviderError("provider_error", "Não foi possível consultar contas Google.");
  }
  const raw = await readBounded(res);
  if (!res.ok) {
    if (res.status === 401) throw new AdProviderError("token_expired", "Conexão Google expirada.");
    if (res.status === 403)
      throw new AdProviderError("no_permission", "Acesso Google não autorizado.");
    if (res.status === 429 || raw.includes("RESOURCE_EXHAUSTED"))
      throw new AdProviderError("rate_limited", "Limite Google Ads atingido.");
    throw new AdProviderError("provider_error", "Falha ao consultar contas Google.");
  }
  let body: { resourceNames?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AdProviderError("partial_data", "Lista Google inválida.");
  }
  if (
    !body ||
    typeof body !== "object" ||
    (body.resourceNames !== undefined && !Array.isArray(body.resourceNames))
  )
    throw new AdProviderError("partial_data", "Lista Google incompleta.");
  const resources = body.resourceNames ?? [];
  if (!Array.isArray(resources) || resources.length > 50)
    throw new AdProviderError("partial_data", "Lista Google excede o limite seguro.");
  const ids = resources.map((resource) => {
    if (typeof resource !== "string" || !/^customers\/\d{10}$/.test(resource))
      throw new AdProviderError("partial_data", "Identificador Google inválido.");
    return resource.slice("customers/".length);
  });
  const accounts = [];
  // Sequential requests avoid a burst against project quota. Any failure
  // rejects the whole discovery, so the list is never presented as complete.
  for (const id of [...new Set(ids)]) accounts.push(await getGoogleAccount(id, token));
  return accounts;
}
