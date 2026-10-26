import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { metaGraphVersion } from "./meta.graph.server";
import { AdProviderError, type AdPlatform } from "./types";

export function adsConfig(platform: AdPlatform) {
  if (platform === "meta") {
    const id = process.env["META_APP_ID"];
    const secret = process.env["META_APP_SECRET"];
    return id && secret ? { clientId: id, clientSecret: secret } : null;
  }
  const id = process.env["GOOGLE_ADS_CLIENT_ID"];
  const secret = process.env["GOOGLE_ADS_CLIENT_SECRET"];
  const dev = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];
  return id && secret && dev ? { clientId: id, clientSecret: secret } : null;
}

export function requireConfig(platform: AdPlatform) {
  const c = adsConfig(platform);
  if (!c) throw new AdProviderError("not_configured", `${platform} não configurado`);
  return c;
}

const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64(String.fromCharCode(...new Uint8Array(sig)));
}

export type OAuthState = { u: string; p: AdPlatform; i: string; t: number; n: string };

export async function signState(state: OAuthState) {
  const { clientSecret } = requireConfig(state.p);
  const payload = b64(JSON.stringify(state));
  return `${payload}.${await hmac(clientSecret, payload)}`;
}

export async function verifyState(raw: string): Promise<OAuthState | null> {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  let state: OAuthState;
  try {
    state = JSON.parse(unb64(payload));
  } catch {
    return null;
  }
  if (state.p !== "meta" && state.p !== "google") return null;
  if (
    typeof state.u !== "string" ||
    !["cordial", "morar"].includes(state.i) ||
    typeof state.n !== "string" ||
    !/^[a-f0-9]{64}$/.test(state.n) ||
    !Number.isFinite(state.t) ||
    state.t > Date.now() + 30_000 ||
    Date.now() - state.t > 15 * 60_000
  )
    return null;
  const cfg = adsConfig(state.p);
  if (!cfg) return null;
  const expected = Buffer.from(await hmac(cfg.clientSecret, payload));
  const supplied = Buffer.from(sig);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? state : null;
}

export function authorizeUrl(platform: AdPlatform, redirectUri: string, state: string) {
  const { clientId } = requireConfig(platform);
  if (platform === "meta") {
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: "ads_read",
      response_type: "code",
    });
    return `https://www.facebook.com/${metaGraphVersion()}/dialog/oauth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "https://www.googleapis.com/auth/adwords",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string | null;
  scopes?: string;
};

export async function exchangeCode(
  platform: AdPlatform,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const { clientId, clientSecret } = requireConfig(platform);
  if (platform === "meta") {
    const q = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`, {
      method: "POST",
      body: q,
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token)
      throw new AdProviderError("provider_error", "Falha ao trocar código Meta");
    // Upgrade to a long-lived token (~60 days) when possible.
    const q2 = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: body.access_token,
    });
    const res2 = await fetch(
      `https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`,
      { method: "POST", body: q2, signal: AbortSignal.timeout(15_000) },
    );
    const long = res2.ok
      ? ((await res2.json()) as { access_token?: string; expires_in?: number })
      : {};
    const token = long.access_token ?? body.access_token;
    const exp = long.expires_in ?? body.expires_in;
    return {
      accessToken: token,
      expiresAt: exp ? new Date(Date.now() + exp * 1000).toISOString() : null,
      scopes: "ads_read",
    };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!res.ok || !body.access_token)
    throw new AdProviderError("provider_error", "Falha ao trocar código Google");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
    scopes: body.scope,
  };
}

export async function refreshGoogle(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireConfig("google");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token)
    throw new AdProviderError("token_expired", "Refresh Google falhou");
  return {
    accessToken: body.access_token,
    refreshToken,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
  };
}
