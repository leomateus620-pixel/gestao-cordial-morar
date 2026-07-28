import { createFileRoute } from "@tanstack/react-router";

/**
 * Drena a fila de sincronização do Google Agenda.
 * Chamado pelo pg_cron a cada minuto; protegido pelo mesmo segredo dos demais hooks.
 */
export const Route = createFileRoute("/api/public/hooks/google-calendar-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NOTIFICATION_HOOK_SECRET;
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("x-api-key") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!secret || provided !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { drainGoogleSyncQueue } = await import("@/lib/google-calendar/google.server");
          const result = await drainGoogleSyncQueue();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[google-calendar-sync] drain falhou:", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
