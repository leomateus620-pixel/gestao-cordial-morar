import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker da fila de publicação de imóveis (ImobiBrasil).
 * Chamado pelo pg_cron e após enfileiramentos. Protegido por segredo compartilhado.
 * O lock/lease fica no banco (property_sync_claim_jobs), então execuções
 * concorrentes nunca processam o mesmo job.
 */
export const Route = createFileRoute("/api/public/hooks/property-sync-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PROPERTY_SYNC_WORKER_SECRET"];
        if (!secret) {
          return Response.json({ error: "Worker secret not configured" }, { status: 503 });
        }
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (provided !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let limit = 5;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = Math.min(10, Math.max(1, body.limit));
        } catch {
          // corpo vazio é válido
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSyncWorker } = await import("@/lib/imobibrasil/sync.server");

        try {
          const result = await runSyncWorker(supabaseAdmin, { limit });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
