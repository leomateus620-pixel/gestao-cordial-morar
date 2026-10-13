import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseCampaignLink as parseLink } from "./link-parser";
import { AD_ERROR_MESSAGES, AdProviderError, type AdErrorCode, type AdPlatform, type DailyInsight, type ParsedCampaignLink } from "./types";

export type AdConnectionPublic = {
  platform: AdPlatform;
  configured: boolean;
  status: "connected" | "expired" | "error" | "not_connected" | "not_configured";
  accountLabel: string | null;
  expiresAt: string | null;
  lastError: string | null;
};

export type AdActionResult =
  | { ok: true; campaignId: string; name: string; days: number }
  | { ok: false; code: AdErrorCode; message: string; platform?: AdPlatform };

const rangeSchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function fail(e: unknown, platform?: AdPlatform): AdActionResult {
  if (e instanceof AdProviderError) return { ok: false, code: e.code, message: AD_ERROR_MESSAGES[e.code], platform };
  console.error("[ads]", e);
  return { ok: false, code: "provider_error", message: AD_ERROR_MESSAGES.provider_error, platform };
}

type Ctx = { supabase: any; userId: string };

async function getToken(ctx: Ctx, platform: AdPlatform) {
  const { adsConfig, refreshGoogle } = await import("./oauth.server");
  if (!adsConfig(platform)) throw new AdProviderError("not_configured", "not configured");
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("ad_platform_connections").select("*").eq("platform", platform).order("updated_at", { ascending: false });
  if (!isAdmin) q = q.eq("user_id", ctx.userId);
  const { data: rows } = await q;
  const own = (rows ?? []).find((r) => r.user_id === ctx.userId) ?? rows?.[0];
  if (!own?.access_token) throw new AdProviderError("not_connected", "not connected");
  const expired = own.expires_at && new Date(own.expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return { token: own.access_token as string, connectionId: own.id as string };
  if (platform === "google" && own.refresh_token) {
    try {
      const t = await refreshGoogle(own.refresh_token);
      await supabaseAdmin
        .from("ad_platform_connections")
        .update({ access_token: t.accessToken, expires_at: t.expiresAt, status: "connected", last_error: null, updated_at: new Date().toISOString() })
        .eq("id", own.id);
      return { token: t.accessToken, connectionId: own.id as string };
    } catch {
      /* fall through */
    }
  }
  await supabaseAdmin.from("ad_platform_connections").update({ status: "expired" }).eq("id", own.id);
  throw new AdProviderError("token_expired", "expired");
}

async function provider(platform: AdPlatform) {
  return platform === "meta" ? (await import("./providers/meta.server")).metaProvider : (await import("./providers/google.server")).googleProvider;
}

const OBJECTIVE_MAP: Record<string, string> = {
  OUTCOME_LEADS: "Leads qualificados",
  LEAD_GENERATION: "Leads qualificados",
  OUTCOME_TRAFFIC: "Visitas",
  OUTCOME_SALES: "Venda",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Relacionamento",
};

async function writeInsights(ctx: Ctx, campaignId: string, insights: DailyInsight[]) {
  if (!insights.length) return;
  const rows = insights.map((d) => ({
    campaign_id: campaignId,
    user_id: ctx.userId,
    data: d.date,
    leads: d.leads,
    clicks: d.clicks,
    accesses: d.clicks,
    views: d.impressions,
    investimento: d.spend,
    impressions: d.impressions,
    reach: d.reach,
    frequency: d.frequency,
    spend: d.spend,
    cpc: d.cpc,
    cpm: d.cpm,
    ctr: d.ctr,
    conversions: d.leads,
  }));
  const { error } = await ctx.supabase.from("marketing_daily_metrics").upsert(rows, { onConflict: "campaign_id,data" });
  if (error) throw new Error(error.message);
}

async function totalSpend(ctx: Ctx, campaignId: string) {
  const { data } = await ctx.supabase.from("marketing_daily_metrics").select("spend").eq("campaign_id", campaignId);
  return Math.round(((data ?? []) as Array<{ spend: number | null }>).reduce((s, r) => s + Number(r.spend ?? 0), 0) * 100) / 100;
}

export const parseCampaignLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => z.object({ url: z.string().max(4000) }).parse(d))
  .handler(async ({ data }): Promise<ParsedCampaignLink> => parseLink(data.url));

export const listAdConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdConnectionPublic[]> => {
    const { adsConfig } = await import("./oauth.server");
    const { data } = await context.supabase.rpc("ad_connections_public");
    const rows = (data ?? []) as Array<{ user_id: string; platform: string; status: string; account_label: string | null; expires_at: string | null; last_error: string | null }>;
    return (["meta", "google"] as const).map((platform) => {
      const configured = !!adsConfig(platform);
      const row = rows.find((r) => r.platform === platform && r.user_id === context.userId) ?? rows.find((r) => r.platform === platform);
      const expired = row?.expires_at && new Date(row.expires_at).getTime() < Date.now() && platform === "meta";
      return {
        platform,
        configured,
        status: !configured ? "not_configured" : !row ? "not_connected" : expired ? "expired" : (row.status as AdConnectionPublic["status"]),
        accountLabel: row?.account_label ?? null,
        expiresAt: row?.expires_at ?? null,
        lastError: row?.last_error ?? null,
      };
    });
  });

export const startAdOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { platform: AdPlatform; imobiliaria?: string | null }) =>
    z.object({ platform: z.enum(["meta", "google"]), imobiliaria: z.enum(["cordial", "morar"]).nullish() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; url: string } | { ok: false; code: AdErrorCode; message: string }> => {
    const { adsConfig, signState, authorizeUrl } = await import("./oauth.server");
    if (!adsConfig(data.platform)) return { ok: false, code: "not_configured", message: AD_ERROR_MESSAGES.not_configured };
    const origin = new URL(getRequest().url).origin;
    const state = await signState({ u: context.userId, p: data.platform, i: data.imobiliaria ?? null, t: Date.now() });
    return { ok: true, url: authorizeUrl(data.platform, `${origin}/api/public/ads-oauth/callback`, state) };
  });

export const importCampaignFromLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; imobiliaria: "cordial" | "morar"; range: { since: string; until: string } }) =>
    z.object({ url: z.string().max(4000), imobiliaria: z.enum(["cordial", "morar"]), range: rangeSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AdActionResult> => {
    const parsed = parseLink(data.url);
    if (!parsed.platform || !parsed.campaignId)
      return { ok: false, code: "invalid_link", message: parsed.error ?? AD_ERROR_MESSAGES.invalid_link, platform: parsed.platform };
    const platform = parsed.platform;
    try {
      const { token } = await getToken(context, platform);
      const p = await provider(platform);
      const ext = await p.getCampaign(parsed.accountId, parsed.campaignId, token);
      const insights = await p.getInsights(parsed.accountId, parsed.campaignId, data.range, token);
      const payload = {
        imobiliaria: data.imobiliaria,
        nome: ext.name,
        canal: platform === "meta" ? "Facebook" : "Google",
        objetivo: OBJECTIVE_MAP[ext.objective ?? ""] ?? "Leads qualificados",
        status: ext.status,
        data_inicio: ext.startDate ?? data.range.since,
        data_fim: ext.endDate ?? data.range.until,
        platform,
        external_campaign_id: ext.id,
        external_account_id: parsed.accountId ?? null,
        source_url: data.url.trim(),
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
        sync_error: null,
      };
      const { data: existing } = await context.supabase
        .from("marketing_campaigns")
        .select("id")
        .eq("user_id", context.userId)
        .eq("platform", platform)
        .eq("external_campaign_id", ext.id)
        .maybeSingle();
      let id: string;
      if (existing) {
        const { error } = await context.supabase.from("marketing_campaigns").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
        id = existing.id;
      } else {
        const { data: row, error } = await context.supabase
          .from("marketing_campaigns")
          .insert({ ...payload, user_id: context.userId, investimento: 0 })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        id = row.id;
      }
      await writeInsights(context, id, insights);
      await context.supabase.from("marketing_campaigns").update({ investimento: await totalSpend(context, id) }).eq("id", id);
      return { ok: true, campaignId: id, name: ext.name, days: insights.length };
    } catch (e) {
      return fail(e, platform);
    }
  });

export const syncCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; range: { since: string; until: string } }) =>
    z.object({ id: z.string().uuid(), range: rangeSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AdActionResult> => {
    const { data: c } = await context.supabase
      .from("marketing_campaigns")
      .select("id, nome, platform, external_campaign_id, external_account_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!c) return { ok: false, code: "campaign_not_found", message: AD_ERROR_MESSAGES.campaign_not_found };
    if (!c.platform || !c.external_campaign_id)
      return { ok: false, code: "invalid_link", message: "Campanha manual — não há o que sincronizar." };
    const platform = c.platform as AdPlatform;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("ad_sync_jobs")
      .insert({ campaign_id: c.id, range_start: data.range.since, range_end: data.range.until })
      .select("id")
      .single();
    const finishJob = (status: "done" | "error", error?: string) =>
      job ? supabaseAdmin.from("ad_sync_jobs").update({ status, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", job.id) : null;
    try {
      const { token } = await getToken(context, platform);
      const p = await provider(platform);
      const ext = await p.getCampaign(c.external_account_id ?? undefined, c.external_campaign_id, token);
      const insights = await p.getInsights(c.external_account_id ?? undefined, c.external_campaign_id, data.range, token);
      await writeInsights(context, c.id, insights);
      await context.supabase
        .from("marketing_campaigns")
        .update({
          nome: ext.name,
          status: ext.status,
          investimento: await totalSpend(context, c.id),
          last_synced_at: new Date().toISOString(),
          sync_status: "synced",
          sync_error: null,
        })
        .eq("id", c.id);
      await finishJob("done");
      return { ok: true, campaignId: c.id, name: ext.name, days: insights.length };
    } catch (e) {
      const r = fail(e, platform);
      const msg = r.ok ? "" : r.message;
      await context.supabase.from("marketing_campaigns").update({ sync_status: "error", sync_error: msg }).eq("id", c.id);
      await finishJob("error", msg);
      return r;
    }
  });
