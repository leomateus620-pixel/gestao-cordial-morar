import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabaseForUser } from "../mcp/supabase";
import { loadAgentContext, type AgentContext } from "./security";
export const adminBookkeeping = () => supabaseAdmin as any;
export async function oauthConfiguration() {
  const origin = process.env.ASSISTANT_PUBLIC_ORIGIN,
    clientId = process.env.ASSISTANT_OAUTH_CLIENT_ID,
    url = process.env.SUPABASE_URL;
  const secret = await Promise.resolve()
    .then(() => adminBookkeeping().rpc("assistant_oauth_client_secret"))
    .catch(() => ({ data: null, error: true }));
  const clientSecret = !secret.error && typeof secret.data === "string" ? secret.data : undefined;
  const validOrigin =
    origin && /^https:\/\/[^/?#]+\/?$/.test(origin) ? origin.replace(/\/$/, "") : undefined;
  return {
    origin: validOrigin,
    clientId,
    clientSecret,
    url,
    configured: Boolean(validOrigin && clientId && clientSecret && url),
  };
}
const base64url = (data: Uint8Array) => Buffer.from(data).toString("base64url");
export const hashState = async (value: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
export async function beginDelegation(userId: string) {
  const config = await oauthConfiguration();
  if (!config.configured)
    throw new Error("A autorização para rotinas ainda não foi configurada pelo administrador.");
  const state = base64url(crypto.getRandomValues(new Uint8Array(32))),
    verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const { error } = await adminBookkeeping().rpc("assistant_oauth_start", {
    p_user: userId,
    p_state_hash: await hashState(state),
    p_verifier: verifier,
  });
  if (error) throw new Error("Não foi possível iniciar a autorização.");
  const url = new URL(`${config.url}/auth/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId!,
    response_type: "code",
    redirect_uri: `${config.origin}/api/public/assistant-oauth/callback`,
    scope: "openid",
    state,
    code_challenge: await hashState(verifier),
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl: url.toString() };
}
export async function oauthToken(params: Record<string, string>, fetcher: typeof fetch = fetch) {
  const config = await oauthConfiguration();
  if (!config.configured) throw new Error("not_configured");
  const response = await fetcher(`${config.url}/auth/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 400 || response.status === 401
        ? "needs_reauthorization"
        : "oauth_unavailable",
    );
  const data = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token) throw new Error("invalid_oauth_response");
  return data;
}
export async function completeDelegation(code: string, state: string) {
  if (code.length > 4000 || state.length > 200) throw new Error("invalid_callback");
  const admin = adminBookkeeping();
  const consumed = await admin.rpc("assistant_oauth_consume", {
    p_state_hash: await hashState(state),
  });
  const row = consumed.data?.[0];
  if (consumed.error || !row) throw new Error("invalid_state");
  const config = await oauthConfiguration();
  const tokens = await oauthToken({
    grant_type: "authorization_code",
    code,
    code_verifier: row.verifier,
    redirect_uri: `${config.origin}/api/public/assistant-oauth/callback`,
  });
  if (!tokens.refresh_token) throw new Error("missing_refresh_grant");
  const client = supabaseForUser({ getToken: () => tokens.access_token! });
  const ctx = await loadAgentContext(client, row.user_id);
  if (ctx.userId !== row.user_id) throw new Error("identity_mismatch");
  const stored = await admin.rpc("assistant_delegation_put", {
    p_user: row.user_id,
    p_client: config.clientId,
    p_refresh: tokens.refresh_token,
  });
  if (stored.error) throw new Error("grant_storage_failed");
}
export async function delegatedContext(
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentContext> {
  const admin = adminBookkeeping(),
    lease = crypto.randomUUID();
  const acquired = await admin.rpc("assistant_delegation_acquire", {
    p_user: userId,
    p_lease: lease,
  });
  const grant = acquired.data?.[0];
  if (acquired.error) throw new Error("delegation_unavailable");
  if (!grant) {
    const metadata = await admin
      .from("assistant_delegations")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    throw new Error(
      metadata.data?.status === "connected" ? "delegation_busy" : "needs_reauthorization",
    );
  }
  try {
    if (grant.client_id !== (await oauthConfiguration()).clientId)
      throw new Error("needs_reauthorization");
    const tokens = await oauthToken(
      { grant_type: "refresh_token", refresh_token: grant.refresh_token },
      fetcher,
    );
    const stored = await admin.rpc("assistant_delegation_rotate", {
      p_user: userId,
      p_lease: lease,
      p_refresh: tokens.refresh_token ?? null,
    });
    if (stored.error || stored.data !== true) throw new Error("needs_reauthorization");
    return await loadAgentContext(
      supabaseForUser({ getToken: () => tokens.access_token! }),
      userId,
    );
  } catch (error) {
    // A transport failure can hide successful rotation. Fail closed: never replay a potentially consumed refresh token.
    await admin
      .from("assistant_delegations")
      .update({
        status: "needs_reauthorization",
        lease_id: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("lease_id", lease);
    throw error;
  }
}
