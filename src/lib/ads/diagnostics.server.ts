import type { SupabaseClient } from "@supabase/supabase-js";
import process from "node:process";
import { AdProviderError, type AdErrorCode } from "./types";
import type { AdCapabilities } from "./ads.functions";
import { resolveConnectionCredential, resolvePageCredential } from "./credentials.server";
import { externalId, metaGraph, metaGraphVersion } from "./meta.graph.server";
import { emptyMetaCapabilities, observedMetaCapability } from "./capabilities";
import { getMetaAccount } from "./providers/meta.server";

export async function diagnoseConnection(connectionId: string): Promise<AdCapabilities> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  // Reopening diagnostics does not repeat provider probes within a minute.
  const { data: cached } = await db
    .from("ad_platform_connections")
    .select("capabilities,last_diagnosed_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (
    cached?.capabilities?.matrix &&
    cached.capabilities.token_valid === true &&
    cached.last_diagnosed_at &&
    Date.now() - Date.parse(cached.last_diagnosed_at) < 60_000
  )
    return cached.capabilities as AdCapabilities;
  const caps: AdCapabilities = {
    api_version: metaGraphVersion(),
    matrix: emptyMetaCapabilities(),
    credential_present: false,
    token_valid: null,
    ads_readable: null,
    page_readable: null,
    leads_readable: null,
    app_webhook_configured: null,
    page_subscribed: null,
    expires_at: null,
    scopes: [],
    checked_at: new Date().toISOString(),
    last_successful_sync: null,
    errors: [],
  };
  let expiryObserved = false;
  const capture = async (capability: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const code = e instanceof AdProviderError ? e.code : "provider_error";
      if ((capability === "token" || capability === "ads") && code === "token_expired") {
        caps.token_valid = false;
        caps.ads_readable = false;
      }
      if (code === "no_permission") {
        if (capability === "ads") caps.ads_readable = false;
        if (capability === "page") caps.page_readable = false;
        if (capability === "leads") caps.leads_readable = false;
      }
      caps.errors.push({ capability, code });
    }
  };
  // Presence is independent of decryptability, validity, expiry and provider availability.
  const { data: stored, error: presenceError } = await db
    .from("ad_platform_connections")
    .select("credential_mode,credential_ref,encrypted_access_token,access_token")
    .eq("id", connectionId)
    .maybeSingle();
  if (presenceError || !stored)
    throw new AdProviderError("not_connected", "Conexão não encontrada.");
  caps.credential_present =
    stored.credential_mode === "system_user"
      ? typeof stored.credential_ref === "string" &&
        /^META_(?:[A-Z0-9]+_)*ACCESS_TOKEN$/.test(stored.credential_ref) &&
        !!process.env[stored.credential_ref]
      : !!(stored.encrypted_access_token || stored.access_token);
  const { data: last } = await db
    .from("marketing_campaigns")
    .select("last_synced_at")
    .eq("connection_id", connectionId)
    .not("last_synced_at", "is", null)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  caps.last_successful_sync = last?.last_synced_at ?? null;
  const { data: originSetting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "site_media_worker_origin")
    .maybeSingle();
  const origin = typeof originSetting?.value === "string" ? originSetting.value.trim() : "";
  caps.webhook_callback_url = /^https:\/\/[^/?#]+\/?$/.test(origin)
    ? `${origin.replace(/\/$/, "")}/api/public/meta/leadgen`
    : null;
  await capture("credential", async () => {
    const { token, connection } = await resolveConnectionCredential(connectionId, {
      platform: "meta",
      allowExpired: true,
    });
    const appId = connection.app_id ?? process.env.META_APP_ID;
    const secretRef = connection.app_secret_ref ?? "META_APP_SECRET";
    const secret = /^META_(?:[A-Z0-9]+_)*APP_SECRET$/.test(secretRef)
      ? process.env[secretRef]
      : undefined;
    // The shared app secret must never validate a token belonging to another configured app.
    if (!appId || !secret || (secretRef === "META_APP_SECRET" && appId !== process.env.META_APP_ID))
      throw new AdProviderError("not_configured", "Aplicativo pendente.");
    const appToken = `${appId}|${secret}`;
    await capture("token", async () => {
      const result = await metaGraph<{
        data: { is_valid: boolean; app_id: string; expires_at?: number; scopes?: string[] };
      }>("/debug_token", appToken, { input_token: token });
      expiryObserved = true;
      caps.token_valid = result.data.is_valid && result.data.app_id === appId;
      caps.expires_at = result.data.expires_at
        ? new Date(result.data.expires_at * 1000).toISOString()
        : null;
      caps.scopes = result.data.scopes ?? [];
      if (!caps.token_valid) throw new AdProviderError("token_expired", "Token inválido.");
    });
    // Do not claim readability from a checkbox/scope. Every green state has an actual read.
    if (caps.token_valid === false) caps.ads_readable = false;
    else if (connection.external_account_id)
      await capture("ads", async () => {
        caps.ads_readable = false;
        const account = await getMetaAccount(connection.external_account_id!, token);
        caps.ads_readable = account.account_id === connection.external_account_id;
        const { error } = await db.from("ad_accounts").upsert(
          {
            connection_id: connectionId,
            platform: "meta",
            external_account_id: account.account_id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezone_name,
          },
          { onConflict: "connection_id,external_account_id" },
        );
        if (error) throw new Error();
      });
    await capture("app_webhook", async () => {
      if (!caps.webhook_callback_url)
        throw new AdProviderError("not_configured", "Origem pública pendente.");
      caps.app_webhook_configured = false;
      const subscriptions = await metaGraph<{
        data: Array<{
          object: string;
          callback_url?: string;
          active?: boolean;
          fields?: Array<{ name: string }>;
        }>;
      }>(`/${externalId(appId)}/subscriptions`, appToken);
      caps.app_webhook_configured = subscriptions.data.some(
        (s) =>
          s.object === "page" &&
          s.callback_url === caps.webhook_callback_url &&
          s.active === true &&
          s.fields?.some((f) => f.name === "leadgen"),
      );
    });
    if (connection.page_id) {
      const { token: pageToken } = await resolvePageCredential(connectionId, true);
      const pageId = externalId(connection.page_id);
      await capture("page", async () => {
        caps.page_readable = false;
        const page = await metaGraph<{ id: string }>(`/${pageId}`, pageToken, { fields: "id" });
        caps.page_readable = page.id === pageId;
      });
      await capture("page_subscription", async () => {
        caps.page_subscribed = false;
        const subscribed = await metaGraph<{
          data: Array<{ id: string; subscribed_fields?: string[] }>;
        }>(`/${pageId}/subscribed_apps`, pageToken, { fields: "id,subscribed_fields" });
        caps.page_subscribed = subscribed.data.some(
          (app) => app.id === appId && app.subscribed_fields?.includes("leadgen"),
        );
      });
      await capture("leads", async () => {
        // Reading form metadata alone is insufficient proof of leads_retrieval.
        const forms = await metaGraph<{ data: Array<{ id: string }> }>(
          `/${pageId}/leadgen_forms`,
          pageToken,
          { fields: "id", limit: "1" },
        );
        if (!forms.data[0]) return;
        caps.leads_readable = false;
        await metaGraph(`/${externalId(forms.data[0].id)}/leads`, pageToken, {
          fields: "id",
          limit: "1",
        });
        caps.leads_readable = true;
      });
    }
  });
  caps.matrix!.token_valid = observedMetaCapability(
    caps.token_valid,
    caps.checked_at,
    "token_debug",
  );
  for (const [name, scope] of [
    ["ads_read_scope", "ads_read"],
    ["ads_management_scope", "ads_management"],
  ] as const)
    caps.matrix![name] = observedMetaCapability(
      caps.token_valid === true ? caps.scopes.includes(scope) : null,
      caps.checked_at,
      "token_debug",
    );
  caps.matrix!.account_read = observedMetaCapability(
    caps.ads_readable,
    caps.checked_at,
    "graph_read",
  );
  caps.matrix!.page_read = observedMetaCapability(
    caps.page_readable,
    caps.checked_at,
    "graph_read",
  );
  caps.matrix!.lead_retrieval = observedMetaCapability(
    caps.leads_readable,
    caps.checked_at,
    "graph_read",
  );
  const { data: received, error: receivedError } = await db
    .from("meta_lead_submissions")
    .select("id")
    .eq("connection_id", connectionId)
    .not("completed_at", "is", null)
    .limit(1)
    .maybeSingle();
  // No submission is absence of evidence, not proof that lead capture is broken.
  if (!receivedError && received)
    caps.matrix!.lead_received = observedMetaCapability(
      true,
      caps.checked_at,
      "persisted_submission",
    );
  // Publication, advanced access, asset assignment and write validation remain
  // unverified until evidence for that exact capability has been recorded.
  const status =
    caps.token_valid === false
      ? "expired"
      : caps.token_valid === true && caps.ads_readable === true
        ? "connected"
        : "error";
  const { error } = await db
    .from("ad_platform_connections")
    .update({
      capabilities: caps,
      last_diagnosed_at: caps.checked_at,
      ...(expiryObserved ? { expires_at: caps.expires_at } : {}),
      status,
      last_error: caps.errors.length
        ? caps.errors.map((e) => `${e.capability}:${e.code}`).join(", ")
        : null,
      updated_at: caps.checked_at,
    })
    .eq("id", connectionId);
  if (error) throw new Error("Não foi possível salvar o diagnóstico.");
  return caps;
}
