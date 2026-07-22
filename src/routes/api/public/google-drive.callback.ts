import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-drive/callback")({
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
          target.searchParams.set("gdrive", status);
          if (detail) target.searchParams.set("detail", detail.slice(0, 200));
          return Response.redirect(target.toString(), 303);
        };

        if (errorParam) return redirectTo("error", errorParam);
        if (!code || !stateToken) return redirectTo("error", "missing_code");

        try {
          const { verifyState, exchangeCode, getUserinfo, logAudit } = await import(
            "@/lib/google-drive/drive.server"
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
          const { error } = await supabaseAdmin.from("google_drive_connections").upsert(
            {
              user_id: userId,
              google_email: info.email,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at: expiresAt,
              scope: tokens.scope ?? null,
              last_error: null,
            },
            { onConflict: "user_id" },
          );
          if (error) throw new Error(error.message);
          await logAudit({
            userId,
            action: "connect_account",
            result: "ok",
            destination: info.email,
          });
          return redirectTo("connected");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro desconhecido";
          console.error("[google-drive.callback] erro:", e instanceof Error ? e.stack : e);
          return redirectTo("error", msg);
        }
      },
    },
  },
});
