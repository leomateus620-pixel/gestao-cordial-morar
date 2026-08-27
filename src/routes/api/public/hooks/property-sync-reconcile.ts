import { createFileRoute } from "@tanstack/react-router";

/**
 * Conferência periódica (somente leitura) entre o cadastro e os sites.
 * Nunca sobrescreve o cadastro local: apenas marca divergências para o admin.
 */
export const Route = createFileRoute("/api/public/hooks/property-sync-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accepted = [
          process.env["PROPERTY_SYNC_WORKER_SECRET"],
          process.env["SUPABASE_PUBLISHABLE_KEY"],
        ].filter((value): value is string => Boolean(value));
        if (!accepted.length) {
          return Response.json({ error: "Worker credentials not configured" }, { status: 503 });
        }
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!accepted.includes(provided)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let limit = 50;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = Math.min(200, Math.max(1, body.limit));
        } catch {
          // corpo vazio é válido
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runReconcileSweep } = await import("@/lib/imobibrasil/reconcile.server");

        try {
          const result = await runReconcileSweep(supabaseAdmin, { limit });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
