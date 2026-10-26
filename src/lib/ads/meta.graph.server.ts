import process from "node:process";
import { AdProviderError, AD_ERROR_MESSAGES, type AdErrorCode } from "./types";

// Pin validated against Meta's official Business SDK v26.0.2 release (2026-09-21).
// Live compatibility is established by the connection diagnostic, never by this default.
export function metaGraphVersion(): string {
  const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
  if (!/^v\d{2,3}\.0$/.test(version))
    throw new AdProviderError("not_configured", "Versão Graph inválida.");
  return version;
}
export const externalId = (value: string): string => {
  if (!/^\d{1,80}$/.test(value))
    throw new AdProviderError("invalid_link", "Identificador externo inválido.");
  return value;
};
export const normalizeAccountId = (id: string) => externalId(id.replace(/^act_/, ""));

function providerCode(status: number, code?: number): AdErrorCode {
  if (code === 190 || status === 401) return "token_expired";
  if ([4, 17, 32, 613].includes(code ?? 0) || status === 429) return "rate_limited";
  if ([10, 200, 294].includes(code ?? 0) || status === 403) return "no_permission";
  if (code === 100 || status === 404) return "campaign_not_found";
  return "provider_error";
}
export function safeNextUrl(next: string): URL {
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    throw new AdProviderError("provider_error", "Paginação inválida.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "graph.facebook.com" ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(`/${metaGraphVersion()}/`)
  )
    throw new AdProviderError("provider_error", "Paginação inválida.");
  // A provider cursor may contain its own access_token. Never follow or log that token.
  url.searchParams.delete("access_token");
  url.searchParams.delete("appsecret_proof");
  return url;
}
export async function metaGraph<T>(
  path: string | URL,
  token: string,
  params: Record<string, string> = {},
  init: RequestInit = {},
): Promise<T> {
  const url =
    path instanceof URL
      ? safeNextUrl(path.href)
      : new URL(`https://graph.facebook.com/${metaGraphVersion()}${path}`);
  if (
    !(path instanceof URL) &&
    (!path.startsWith("/") || path.startsWith("//") || path.includes("?"))
  )
    throw new AdProviderError("invalid_link", "Caminho inválido.");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AdProviderError("provider_error", "A Meta não respondeu no prazo.");
  }
  const body = (await response.json().catch(() => null)) as
    | ({ error?: { code?: number } } & T)
    | null;
  if (!response.ok || !body || body.error) {
    const code = providerCode(response.status, body?.error?.code);
    // Provider messages can echo tokens and personal data. Expose only our fixed taxonomy.
    throw new AdProviderError(code, AD_ERROR_MESSAGES[code]);
  }
  return body;
}
export async function metaPages<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let next: string | URL = path;
  let pageCount = 0;
  const started = Date.now();
  while (next) {
    const key = typeof next === "string" ? next : next.href;
    if (seen.has(key) || ++pageCount > 1000 || Date.now() - started > 90_000)
      throw new AdProviderError(
        "partial_data",
        "Limite operacional de paginação; dados não confirmados.",
      );
    seen.add(key);
    const page: { data?: T[]; paging?: { next?: string } } = await metaGraph(
      next,
      token,
      pageCount === 1 ? { limit: "100", ...params } : {},
    );
    if (!Array.isArray(page.data))
      throw new AdProviderError("provider_error", "Página de resultados inválida.");
    rows.push(...page.data);
    if (!page.paging?.next) break;
    next = safeNextUrl(page.paging.next);
  }
  return rows;
}
