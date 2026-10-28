import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";
import { exchangeCode, verifyState } from "@/lib/ads/oauth.server";
import { encryptCredential } from "@/lib/ads/credentials.server";

export const Route = createFileRoute("/api/public/ads-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (status: string) =>
          Response.redirect(`${url.origin}/configuracoes?ads=${status}`, 302);
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state");
        if (!code || !rawState) return back("cancelado");
        const state = await verifyState(rawState);
        if (!state || getCookie("ads_oauth_nonce") !== state.n) return back("invalido");
        deleteCookie("ads_oauth_nonce", { path: "/api/public/ads-oauth/callback" });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as unknown as SupabaseClient;
          // A durable, session-bound, single-use nonce is consumed BEFORE exchanging the code.
          const { data: consumed, error: nonceError } = await db.rpc("ad_oauth_consume", {
            p_nonce_hash: createHash("sha256").update(state.n).digest("hex"),
            p_user_id: state.u,
          });
          if (nonceError || consumed !== true) return back("invalido");
          const { data: admin, error: accessError } = await db.rpc("marketing_actor_can_act", {
            p_actor: state.u,
            p_action: "manage_connection",
            p_agency: state.i,
          });
          if (accessError || admin !== true) return back("invalido");
          const tokens = await exchangeCode(
            state.p,
            code,
            `${url.origin}/api/public/ads-oauth/callback`,
          );
          const { data: existing, error: lookupError } = await db
            .from("ad_platform_connections")
            .select("id, credential_mode, encrypted_refresh_token, refresh_token")
            .eq("user_id", state.u)
            .eq("platform", state.p)
            .eq("imobiliaria", state.i)
            .maybeSingle();
          if (lookupError || existing?.credential_mode === "system_user") return back("conflito");
          const row = {
            user_id: state.u,
            platform: state.p,
            imobiliaria: state.i,
            credential_mode: "oauth",
            credential_ref: null,
            account_label: state.p === "meta" ? "Meta Ads" : "Google Ads",
            encrypted_access_token: encryptCredential(tokens.accessToken),
            encrypted_refresh_token: tokens.refreshToken
              ? encryptCredential(tokens.refreshToken)
              : (existing?.encrypted_refresh_token ??
                (existing?.refresh_token ? encryptCredential(existing.refresh_token) : null)),
            access_token: null,
            refresh_token: null,
            expires_at: tokens.expiresAt,
            scopes: tokens.scopes ?? null,
            capabilities: {},
            last_diagnosed_at: null,
            status: "connected",
            last_error: null,
            updated_at: new Date().toISOString(),
          };
          const { error } = existing
            ? await db.from("ad_platform_connections").update(row).eq("id", existing.id)
            : await db.from("ad_platform_connections").insert(row);
          if (error) return back("erro");
          return back("conectado");
        } catch {
          // Never log OAuth bodies, tokens or provider messages.
          return back("erro");
        }
      },
    },
  },
});
