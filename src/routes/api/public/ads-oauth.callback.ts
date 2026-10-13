import { createFileRoute } from "@tanstack/react-router";
import { exchangeCode, verifyState } from "@/lib/ads/oauth.server";

export const Route = createFileRoute("/api/public/ads-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (status: string) => Response.redirect(`${url.origin}/marketing?ads=${status}`, 302);
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state");
        if (!code || !rawState) return back("cancelado");
        // The signed state is the only proof of who started the flow.
        const state = await verifyState(rawState);
        if (!state) return back("invalido");
        try {
          const tokens = await exchangeCode(state.p, code, `${url.origin}/api/public/ads-oauth/callback`);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: existing } = await supabaseAdmin
            .from("ad_platform_connections")
            .select("id, refresh_token")
            .eq("user_id", state.u)
            .eq("platform", state.p)
            .maybeSingle();
          const row = {
            user_id: state.u,
            platform: state.p,
            imobiliaria: state.i,
            account_label: state.p === "meta" ? "Meta Ads" : "Google Ads",
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken ?? existing?.refresh_token ?? null,
            expires_at: tokens.expiresAt,
            scopes: tokens.scopes ?? null,
            status: "connected",
            last_error: null,
            updated_at: new Date().toISOString(),
          };
          const { error } = existing
            ? await supabaseAdmin.from("ad_platform_connections").update(row).eq("id", existing.id)
            : await supabaseAdmin.from("ad_platform_connections").insert(row);
          if (error) throw error;
          return back("conectado");
        } catch (e) {
          console.error("[ads-oauth]", e);
          return back("erro");
        }
      },
    },
  },
});
