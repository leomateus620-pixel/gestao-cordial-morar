import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canonicalCampaignUrl, parseCampaignLink as parseLink } from "./link-parser";
import {
  AD_ERROR_MESSAGES,
  AdProviderError,
  type AdErrorCode,
  type AdPlatform,
  type AdOAuthPurpose,
  type ParsedCampaignLink,
} from "./types";
import {
  requireAdsAdmin,
  requireMarketingAccess,
  requireMarketingAction,
  type AdsContext,
} from "./authorization.server";

export type AdCapabilities = {
  matrix?: import("./capabilities").MetaCapabilityMatrix;
  api_version?: string;
  credential_present: boolean;
  token_valid: boolean | null;
  ads_readable: boolean | null;
  page_readable: boolean | null;
  leads_readable: boolean | null;
  app_webhook_configured: boolean | null;
  page_subscribed: boolean | null;
  expires_at: string | null;
  scopes: string[];
  checked_at: string;
  last_successful_sync: string | null;
  webhook_callback_url?: string | null;
  errors: Array<{ capability: string; code: AdErrorCode }>;
};
export type AdConnectionPublic = {
  id?: string;
  imobiliaria?: string | null;
  platform: AdPlatform;
  configured: boolean;
  status: "connected" | "expired" | "error" | "not_connected" | "not_configured";
  accountLabel: string | null;
  accountId?: string | null;
  pageId?: string | null;
  appId?: string | null;
  credentialMode?: string;
  capabilities?: AdCapabilities | null;
  expiresAt: string | null;
  lastError: string | null;
};
export type AdActionResult =
  | { ok: true; campaignId: string; name: string; days: number; queued?: boolean; jobId?: string }
  | { ok: false; code: AdErrorCode; message: string; platform?: AdPlatform };
const rangeSchema = z
  .object({ since: z.iso.date(), until: z.iso.date() })
  .refine(
    (r) => r.since <= r.until && Date.parse(r.until) - Date.parse(r.since) <= 93 * 86400000,
    "Selecione até 93 dias.",
  );
function fail(e: unknown, platform?: AdPlatform): Extract<AdActionResult, { ok: false }> {
  const code = e instanceof AdProviderError ? e.code : "provider_error";
  return { ok: false, code, message: AD_ERROR_MESSAGES[code], platform };
}
async function dbAdmin() {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;
}
async function connectionForScope(
  ctx: AdsContext,
  platform: AdPlatform,
  imobiliaria: string,
  connectionId?: string,
) {
  await requireMarketingAction(ctx, "manage_manual", imobiliaria);
  const db = await dbAdmin();
  let query = db
    .from("ad_platform_connections")
    .select("id,platform,imobiliaria,external_account_id")
    .eq("platform", platform)
    .eq("imobiliaria", imobiliaria);
  if (connectionId) query = query.eq("id", connectionId);
  const { data, error } = await query;
  // An absent explicit ID is compatible only with ONE exact brand/platform connection.
  if (error || data?.length !== 1)
    throw new AdProviderError("not_connected", "Selecione uma conexão da imobiliária.");
  return data[0] as {
    id: string;
    platform: AdPlatform;
    imobiliaria: string;
    external_account_id: string | null;
  };
}
export const parseCampaignLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => z.object({ url: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }): Promise<ParsedCampaignLink> => {
    await requireMarketingAccess(context);
    return parseLink(data.url);
  });
export const listAdConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdConnectionPublic[]> => {
    await requireMarketingAccess(context);
    const { marketingAccess, visibleAdPlatforms } = await import("./authorization.server");
    const access = await marketingAccess(context);
    if (!access.isAdmin && !access.isReviewer) {
      try {
        await requireMarketingAction(context, "read_ad_budget");
      } catch {
        return [];
      }
    }

    const { adsConfig } = await import("./oauth.server");
    const { data, error } = await context.supabase.rpc("ad_connections_public");
    if (error) throw new Error("Não foi possível consultar as conexões.");
    const rows = (data ?? []) as Array<{
      id: string;
      imobiliaria: string | null;
      platform: AdPlatform;
      credential_mode: string;
      status: AdConnectionPublic["status"];
      account_label: string | null;
      external_account_id: string | null;
      page_id: string | null;
      app_id: string | null;
      capabilities: AdCapabilities | null;
      expires_at: string | null;
      last_error: string | null;
    }>;
    const allowedPlatforms = visibleAdPlatforms(access.isReviewer);
    const result: AdConnectionPublic[] = rows
      .filter((r) => allowedPlatforms.includes(r.platform))
      .map((r) => ({
        id: r.id,
        imobiliaria: r.imobiliaria,
        platform: r.platform,
        configured: r.credential_mode === "system_user" ? true : !!adsConfig(r.platform),
        status: r.status,
        accountLabel: r.account_label,
        accountId: r.external_account_id,
        pageId: r.page_id,
        appId: r.app_id,
        credentialMode: r.credential_mode,
        capabilities: r.capabilities ?? null,
        expiresAt: r.expires_at,
        lastError: r.last_error ? "Revise o diagnóstico da conexão." : null,
      }));
    for (const platform of allowedPlatforms)
      if (!rows.some((r) => r.platform === platform))
        result.push({
          platform,
          configured: !!adsConfig(platform),
          status: adsConfig(platform) ? "not_connected" : "not_configured",
          accountLabel: null,
          expiresAt: null,
          lastError: null,
        });
    return result;
  });
export const startAdOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { platform: AdPlatform; imobiliaria?: string | null; purpose?: AdOAuthPurpose }) =>
      z
        .object({
          platform: z.enum(["meta", "google"]),
          imobiliaria: z.enum(["cordial", "morar"]).nullish(),
          purpose: z.enum(["read", "manage", "leads"]).default("read"),
        })
        .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; url: string } | { ok: false; code: AdErrorCode; message: string }> => {
      try {
        await requireAdsAdmin(context);
        if (!data.imobiliaria)
          throw new AdProviderError("invalid_link", "Selecione a imobiliária.");
        const { adsConfig, signState, authorizeUrl } = await import("./oauth.server");
        const { encryptCredential } = await import("./credentials.server");
        encryptCredential("configuration-probe");
        if (!adsConfig(data.platform))
          throw new AdProviderError("not_configured", "Configuração pendente.");
        if (data.platform === "meta") {
          const { data: system, error: lookupError } = await (await dbAdmin())
            .from("ad_platform_connections")
            .select("id")
            .eq("platform", "meta")
            .eq("imobiliaria", data.imobiliaria)
            .eq("credential_mode", "system_user")
            .limit(1);
          if (lookupError) throw new Error("Não foi possível conferir a conexão.");
          if (system?.length)
            return {
              ok: false,
              code: "conflict",
              message:
                "Esta imobiliária usa uma credencial de usuário do sistema. Ajuste suas permissões na Meta e execute o diagnóstico da conexão.",
            };
        } else if (data.purpose !== "read")
          throw new AdProviderError("invalid_parameter", "Finalidade de autorização inválida.");
        const origin = new URL(getRequest().url).origin;
        const nonce = randomBytes(32).toString("hex");
        const { error } = await (await dbAdmin()).from("ad_oauth_states").insert({
          nonce_hash: createHash("sha256").update(nonce).digest("hex"),
          user_id: context.userId,
          platform: data.platform,
          imobiliaria: data.imobiliaria,
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        });
        if (error) throw new Error();
        const state = await signState({
          u: context.userId,
          p: data.platform,
          i: data.imobiliaria,
          t: Date.now(),
          n: nonce,
          s: data.purpose,
        });
        setCookie("ads_oauth_nonce", nonce, {
          path: "/api/public/ads-oauth/callback",
          httpOnly: true,
          secure: origin.startsWith("https:"),
          sameSite: "lax",
          maxAge: 900,
        });
        return {
          ok: true,
          url: authorizeUrl(
            data.platform,
            `${origin}/api/public/ads-oauth/callback`,
            state,
            data.purpose,
          ),
        };
      } catch (e) {
        return fail(e);
      }
    },
  );
const systemSchema = z.object({
  imobiliaria: z.enum(["cordial", "morar"]),
  appId: z.string().regex(/^\d{1,80}$/),
  pageId: z.string().regex(/^\d{1,80}$/),
  accountId: z.string().regex(/^(act_)?\d{1,80}$/),
  credentialRef: z.string().default("META_ACCESS_TOKEN"),
  pageCredentialRef: z.string().optional(),
  appSecretRef: z.string().default("META_APP_SECRET"),
});
export const configureMetaSystemConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof systemSchema>) => systemSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdsAdmin(context);
    const { credentialReference } = await import("./credentials.server");
    const { normalizeAccountId } = await import("./meta.graph.server");
    credentialReference(data.credentialRef);
    if (data.pageCredentialRef) credentialReference(data.pageCredentialRef);
    if (!/^META_(?:[A-Z0-9]+_)*APP_SECRET$/.test(data.appSecretRef))
      throw new Error("Referência de aplicativo inválida.");
    if (
      data.imobiliaria !== "cordial" &&
      [data.credentialRef, data.pageCredentialRef].includes("META_ACCESS_TOKEN")
    )
      throw new Error("A Morar exige referência de credencial própria.");
    if (data.appSecretRef === "META_APP_SECRET" && data.appId !== process.env.META_APP_ID)
      throw new Error("Aplicativo não corresponde à configuração do servidor.");
    const db = await dbAdmin();
    const { data: existing, error: lookupError } = await db
      .from("ad_platform_connections")
      .select("id,user_id,credential_mode")
      .eq("platform", "meta")
      .eq("imobiliaria", data.imobiliaria)
      .eq("external_account_id", normalizeAccountId(data.accountId))
      .maybeSingle();
    if (lookupError) throw new Error("Conexões ambíguas. Revise os vínculos existentes.");
    // Linking metadata does not certify any capability or overwrite legacy credentials.
    const row = {
      user_id: existing?.user_id ?? context.userId,
      platform: "meta",
      imobiliaria: data.imobiliaria,
      credential_mode: "system_user",
      credential_ref: data.credentialRef,
      page_credential_ref: data.pageCredentialRef ?? null,
      app_secret_ref: data.appSecretRef,
      app_id: data.appId,
      page_id: data.pageId,
      external_account_id: normalizeAccountId(data.accountId),
      account_label: `Meta Ads · ${data.imobiliaria === "cordial" ? "Cordial" : "Morar"}`,
      status: "error",
      capabilities: {},
      last_diagnosed_at: null,
      last_error: "Diagnóstico pendente",
      updated_at: new Date().toISOString(),
    };
    const result = existing
      ? await db
          .from("ad_platform_connections")
          .update(row)
          .eq("id", existing.id)
          .select("id")
          .single()
      : await db.from("ad_platform_connections").insert(row).select("id").single();
    if (result.error)
      throw new Error("Não foi possível salvar a conexão. Revise os vínculos existentes.");
    return { connectionId: result.data.id as string };
  });
export const diagnoseMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string }) => z.object({ connectionId: z.uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AdCapabilities> => {
    await requireAdsAdmin(context);
    const { diagnoseConnection } = await import("./diagnostics.server");
    return diagnoseConnection(data.connectionId);
  });
export const listMetaAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string }) => z.object({ connectionId: z.uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdsAdmin(context);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { discoverMetaAccounts } = await import("./providers/meta.server");
    const { token, connection } = await resolveConnectionCredential(data.connectionId, {
      platform: "meta",
    });
    const accounts = (await discoverMetaAccounts(token)).filter(
      (a) => !connection.external_account_id || a.account_id === connection.external_account_id,
    );
    const db = await dbAdmin();
    if (accounts.length) {
      const { error } = await db.from("ad_accounts").upsert(
        accounts.map((a) => ({
          connection_id: data.connectionId,
          platform: "meta",
          external_account_id: a.account_id,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone_name,
        })),
        { onConflict: "connection_id,external_account_id" },
      );
      if (error) throw new Error("Não foi possível registrar as contas.");
    }
    return accounts.map((a) => ({
      id: a.account_id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
    }));
  });
export const listMetaCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string; accountId: string }) =>
    z.object({ connectionId: z.uuid(), accountId: z.string().regex(/^(act_)?\d{1,80}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireMarketingAction(context, "manage_manual");
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { discoverMetaCampaigns, getMetaAccount } = await import("./providers/meta.server");
    const { token, connection } = await resolveConnectionCredential(data.connectionId, {
      platform: "meta",
      accountId: data.accountId,
    });
    if (!connection.imobiliaria)
      throw new AdProviderError("no_permission", "Vincule a imobiliária primeiro.");
    await requireMarketingAccess(context, connection.imobiliaria);
    await getMetaAccount(data.accountId, token);
    return discoverMetaCampaigns(data.accountId, token);
  });
const importSchema = z.object({
  connectionId: z.uuid().optional(),
  accountId: z
    .string()
    .regex(/^(act_)?\d{1,80}$/)
    .optional(),
  url: z.string().max(4000),
  imobiliaria: z.enum(["cordial", "morar"]),
  range: rangeSchema,
});
export const importCampaignFromLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof importSchema>) => importSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdActionResult> => {
    const parsed = parseLink(data.url);
    if (!parsed.platform || !parsed.campaignId)
      return fail(new AdProviderError("invalid_link", "Link inválido."), parsed.platform);
    try {
      return await importCampaign(context, {
        ...data,
        platform: parsed.platform,
        campaignId: parsed.campaignId,
        accountId: data.accountId ?? parsed.accountId,
      });
    } catch (e) {
      return fail(e, parsed.platform);
    }
  });
const discoveredSchema = z.object({
  connectionId: z.uuid(),
  accountId: z.string().regex(/^(act_)?\d{1,80}$/),
  campaignId: z.string().regex(/^\d{1,80}$/),
  imobiliaria: z.enum(["cordial", "morar"]),
  range: rangeSchema,
});
export const importDiscoveredMetaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof discoveredSchema>) => discoveredSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdActionResult> => {
    try {
      return await importCampaign(context, { ...data, platform: "meta" });
    } catch (e) {
      return fail(e, "meta");
    }
  });
async function importCampaign(
  ctx: AdsContext,
  data: {
    platform: AdPlatform;
    imobiliaria: string;
    connectionId?: string;
    accountId?: string;
    campaignId: string;
    url?: string;
    range: { since: string; until: string };
  },
): Promise<AdActionResult> {
  const conn = await connectionForScope(ctx, data.platform, data.imobiliaria, data.connectionId);
  const accountId = data.accountId ?? conn.external_account_id;
  if (!accountId) throw new AdProviderError("invalid_link", "Selecione uma conta de anúncios.");
  const { resolveConnectionCredential } = await import("./credentials.server");
  const { token } = await resolveConnectionCredential(conn.id, {
    platform: data.platform,
    imobiliaria: data.imobiliaria,
    accountId,
  });
  const p =
    data.platform === "meta"
      ? (await import("./providers/meta.server")).metaProvider
      : (await import("./providers/google.server")).googleProvider;
  const ext = await p.getCampaign(accountId, data.campaignId, token);
  const db = await dbAdmin();
  const a =
    data.platform === "meta"
      ? await (await import("./providers/meta.server")).getMetaAccount(accountId, token)
      : await (await import("./providers/google.server")).getGoogleAccount(accountId, token);
  const resultAccount = await db
    .from("ad_accounts")
    .upsert(
      {
        connection_id: conn.id,
        platform: data.platform,
        external_account_id: a.account_id,
        name: a.name,
        currency: a.currency,
        timezone: "timezone_name" in a ? a.timezone_name : a.timezone,
      },
      { onConflict: "connection_id,external_account_id" },
    )
    .select("id")
    .single();
  if (resultAccount.error) throw new Error();
  const account = resultAccount.data;
  const normalizedAccount = accountId.replace(/^act_/, "");
  const { data: existing, error: findError } = await db
    .from("marketing_campaigns")
    .select("id,connection_id")
    .eq("platform", data.platform)
    .eq("imobiliaria", data.imobiliaria)
    .eq("external_account_id", normalizedAccount)
    .eq("external_campaign_id", ext.id)
    .maybeSingle();
  if (findError || (existing?.connection_id && existing.connection_id !== conn.id))
    throw new AdProviderError("no_permission", "Campanha já vinculada a outra conexão.");
  const payload = {
    imobiliaria: data.imobiliaria,
    nome: ext.name,
    canal: data.platform === "meta" ? "Facebook" : "Google",
    objetivo: "Leads qualificados",
    status: ext.status,
    data_inicio: ext.startDate ?? data.range.since,
    data_fim: ext.endDate ?? data.range.until,
    platform: data.platform,
    connection_id: conn.id,
    ad_account_id: account?.id ?? null,
    external_campaign_id: ext.id,
    external_account_id: normalizedAccount,
    source_url: canonicalCampaignUrl(data.platform, normalizedAccount, ext.id),
    sync_status: "error",
    sync_error: "Sincronização ainda não agendada.",
  };
  const result = existing
    ? await db
        .from("marketing_campaigns")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await db
        .from("marketing_campaigns")
        .insert({ ...payload, user_id: ctx.userId, investimento: 0 })
        .select("id")
        .single();
  if (result.error) throw new Error();
  return enqueueCampaign(ctx, result.data.id, ext.name, data.range);
}
async function enqueueCampaign(
  ctx: AdsContext,
  id: string,
  name: string,
  range: { since: string; until: string },
): Promise<AdActionResult> {
  const { data: jobId, error } = await (
    await dbAdmin()
  ).rpc("ad_sync_enqueue", {
    p_campaign_id: id,
    p_range_start: range.since,
    p_range_end: range.until,
    p_requested_by: ctx.userId,
  });
  if (error || !jobId) throw new Error();
  return {
    ok: true,
    campaignId: id,
    name,
    days: 0,
    queued: true,
    jobId: typeof jobId === "string" ? jobId : jobId.id,
  };
}
export const syncCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; range: { since: string; until: string } }) =>
    z.object({ id: z.uuid(), range: rangeSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AdActionResult> => {
    try {
      await requireMarketingAction(context, "manage_manual");
      const { data: c, error } = await (await dbAdmin())
        .from("marketing_campaigns")
        .select(
          "id,nome,platform,connection_id,external_campaign_id,external_account_id,imobiliaria",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (error || !c) throw new AdProviderError("campaign_not_found", "Campanha não encontrada.");
      if (!c.platform || !c.external_campaign_id)
        throw new AdProviderError("invalid_link", "Campanha manual.");
      if (!c.connection_id || !c.external_account_id)
        throw new AdProviderError("not_connected", "Vincule a campanha a uma conexão e conta.");
      await connectionForScope(context, c.platform, c.imobiliaria, c.connection_id);
      return enqueueCampaign(context, c.id, c.nome, data.range);
    } catch (e) {
      return fail(e);
    }
  });

export const listAdSyncJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignIds?: string[] }) =>
    z.object({ campaignIds: z.array(z.uuid()).max(100).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireMarketingAccess(context);
    const agencies: string[] = [];
    for (const agency of ["cordial", "morar"]) {
      try {
        await requireMarketingAccess(context, agency);
        agencies.push(agency);
      } catch {
        /* omitted scope */
      }
    }
    if (!agencies.length) return [];
    let q = (await dbAdmin())
      .from("ad_sync_jobs")
      .select(
        "id,campaign_id,status,error,started_at,finished_at,attempts,next_attempt_at,marketing_campaigns!inner(imobiliaria)",
      )
      .in("marketing_campaigns.imobiliaria", agencies)
      .order("started_at", { ascending: false })
      .limit(100);
    if (data.campaignIds?.length) q = q.in("campaign_id", data.campaignIds);
    const { data: rows, error } = await q;
    if (error) throw new Error("Não foi possível consultar a sincronização.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      campaign_id: r.campaign_id,
      status: r.status,
      started_at: r.started_at,
      finished_at: r.finished_at,
      attempts: r.attempts,
      next_attempt_at: r.next_attempt_at,
      error: r.error
        ? "A sincronização precisa de atenção. Revise a conexão ou tente novamente."
        : null,
    }));
  });

/** Direct Google account discovery. A manager route is not inferred or selected here. */
export const listGoogleAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string }) => z.object({ connectionId: z.uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdsAdmin(context);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { discoverGoogleAccounts } = await import("./providers/google.server");
    const { token, connection } = await resolveConnectionCredential(data.connectionId, {
      platform: "google",
    });
    if (!connection.imobiliaria || !["cordial", "morar"].includes(connection.imobiliaria))
      throw new AdProviderError("no_permission", "Vincule a imobiliária primeiro.");
    const accounts = await discoverGoogleAccounts(token);
    return accounts.map((account) => ({
      id: account.account_id,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
      manager: account.manager,
      testAccount: account.testAccount,
    }));
  });

export const selectGoogleAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectionId: string; accountId: string }) =>
    z
      .object({
        connectionId: z.uuid(),
        accountId: z.string().regex(/^(?:\d{10}|\d{3}-\d{3}-\d{4})$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdsAdmin(context);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { discoverGoogleAccounts, googleCustomerId } = await import("./providers/google.server");
    const { token, connection } = await resolveConnectionCredential(data.connectionId, {
      platform: "google",
    });
    if (!connection.imobiliaria || !["cordial", "morar"].includes(connection.imobiliaria))
      throw new AdProviderError("no_permission", "Vincule a imobiliária primeiro.");
    const accountId = googleCustomerId(data.accountId);
    if (
      connection.external_account_id &&
      googleCustomerId(connection.external_account_id) !== accountId
    )
      throw new AdProviderError("conflict", "Esta conexão já está vinculada a outra conta.");
    const account = (await discoverGoogleAccounts(token)).find(
      (candidate) => candidate.account_id === accountId,
    );
    if (!account || account.manager)
      throw new AdProviderError(
        "no_permission",
        "Selecione uma conta anunciante diretamente acessível.",
      );
    // Hash the exact stored credential used for the Google proof. The service-only
    // database function verifies it and writes the account and binding atomically.
    const hash = (value: string | null | undefined) =>
      value ? createHash("sha256").update(value).digest("hex") : null;
    const { error } = await (
      await dbAdmin()
    ).rpc("ad_google_bind_account", {
      p_connection_id: data.connectionId,
      p_imobiliaria: connection.imobiliaria,
      p_external_account_id: account.account_id,
      p_name: account.name,
      p_currency: account.currency,
      p_timezone: account.timezone,
      p_encrypted_access_hash: hash(connection.encrypted_access_token),
      p_plain_access_hash: hash(connection.access_token),
    });
    if (error)
      throw new AdProviderError(
        "conflict",
        "Não foi possível vincular a conta; atualize e tente novamente.",
      );
    return { accountId };
  });
