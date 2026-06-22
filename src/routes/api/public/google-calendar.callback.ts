import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateToken = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");
        const origin = url.origin;

        const redirectTo = (status: string, detail?: string) => {
          const target = new URL("/configuracoes", origin);
          target.searchParams.set("google", status);
          if (detail) target.searchParams.set("detail", detail.slice(0, 200));
          return Response.redirect(target.toString(), 303);
        };

        if (errorParam) return redirectTo("error", errorParam);
        if (!code || !stateToken) return redirectTo("error", "missing_code");

        try {
          const { verifyState, exchangeCode, getUserinfo } = await import(
            "@/lib/google-calendar/google.server"
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { userId, origin: stateOrigin } = verifyState(stateToken);
          const tokens = await exchangeCode(code, stateOrigin);
          if (!tokens.refresh_token) {
            return redirectTo(
              "error",
              "sem refresh_token — desconecte o app nas permissões Google e tente de novo",
            );
          }
          const info = await getUserinfo(tokens.access_token);
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          const { error } = await supabaseAdmin.from("google_calendar_connections").upsert(
            {
              user_id: userId,
              google_email: info.email,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at: expiresAt,
              scope: tokens.scope ?? null,
              calendar_id: "primary",
              last_error: null,
            },
            { onConflict: "user_id" },
          );
          if (error) throw new Error(error.message);
          return redirectTo("connected");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro desconhecido";
          return redirectTo("error", msg);
        }
      },
    },
  },
});
