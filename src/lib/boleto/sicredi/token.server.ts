/**
 * Server-only OAuth2 (password + refresh) for Sicredi Cobrança. Tokens live only in this
 * isolate's memory, keyed by brand × environment × credential fingerprint, with a single
 * in-flight promise per key so concurrent calls authenticate once.
 */
import { sicrediUrls, type SicrediCredentials } from "./config.server";
import { sicrediRequest, SicrediError, type FetchLike } from "./http.server";

type Entry = {
  access?: string;
  accessExp?: number;
  refresh?: string;
  refreshExp?: number;
  inflight?: Promise<string>;
};
const cache = new Map<string, Entry>();
export const TOKEN_MARGIN_MS = 60_000;

async function cacheKey(c: SicrediCredentials) {
  const data = new TextEncoder().encode(
    `${c.apiKey}|${c.codigoBeneficiario}${c.cooperativa}|${c.codigoAcesso}`,
  );
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const fp = Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${c.brand}:${c.ambiente}:${fp}`;
}

export type TokenDeps = { fetchImpl?: FetchLike; now?: () => number };

async function requestToken(c: SicrediCredentials, form: Record<string, string>, deps: TokenDeps) {
  const res = await sicrediRequest({
    fetchImpl: deps.fetchImpl,
    op: "autenticar",
    method: "POST",
    url: sicrediUrls(c.ambiente).token,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-api-key": c.apiKey,
      context: "COBRANCA",
    },
    body: new URLSearchParams(form).toString(),
  });
  const b = (res.body ?? {}) as Record<string, unknown>;
  if (typeof b.access_token !== "string" || !b.access_token)
    throw new SicrediError("corpo_invalido", res.status, "O Sicredi não devolveu o token de acesso.");
  return {
    access: b.access_token,
    expiresIn: Number(b.expires_in) > 0 ? Number(b.expires_in) : 300,
    refresh: typeof b.refresh_token === "string" ? b.refresh_token : undefined,
    refreshExpiresIn: Number(b.refresh_expires_in) > 0 ? Number(b.refresh_expires_in) : 1800,
  };
}

/** username = código do beneficiário (5) + cooperativa (4). */
export function sicrediUsername(c: Pick<SicrediCredentials, "codigoBeneficiario" | "cooperativa">) {
  return `${c.codigoBeneficiario}${c.cooperativa}`;
}

export async function getSicrediToken(c: SicrediCredentials, deps: TokenDeps = {}): Promise<string> {
  const now = deps.now ?? Date.now;
  const key = await cacheKey(c);
  const entry = cache.get(key) ?? {};
  cache.set(key, entry);
  if (entry.access && (entry.accessExp ?? 0) - TOKEN_MARGIN_MS > now()) return entry.access;
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    let t: Awaited<ReturnType<typeof requestToken>> | null = null;
    if (entry.refresh && (entry.refreshExp ?? 0) - TOKEN_MARGIN_MS > now()) {
      try {
        t = await requestToken(c, { grant_type: "refresh_token", refresh_token: entry.refresh }, deps);
      } catch {
        entry.refresh = undefined;
      }
    }
    t ??= await requestToken(
      c,
      { grant_type: "password", username: sicrediUsername(c), password: c.codigoAcesso, scope: "cobranca" },
      deps,
    );
    const at = now();
    entry.access = t.access;
    entry.accessExp = at + t.expiresIn * 1000;
    entry.refresh = t.refresh;
    entry.refreshExp = t.refresh ? at + t.refreshExpiresIn * 1000 : undefined;
    return t.access;
  })();
  try {
    return await entry.inflight;
  } finally {
    entry.inflight = undefined;
  }
}

export async function forgetSicrediToken(c: SicrediCredentials) {
  cache.delete(await cacheKey(c));
}
/** Test helper. */
export function clearSicrediTokenCache() {
  cache.clear();
}
