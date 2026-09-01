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

        let limit = 8;
        let drain = false;
        try {
          const body = (await request.json()) as { limit?: number; drain?: boolean } | null;
          if (body && typeof body.limit === "number") limit = Math.min(10, Math.max(1, body.limit));
          if (body && typeof body.drain === "boolean") drain = body.drain;
        } catch {
          // corpo vazio é válido
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSyncWorker } = await import("@/lib/imobibrasil/sync.server");

        // Teto de segurança: no máximo 5 ciclos por chamada, para nunca
        // transformar a drenagem em loop infinito dentro do worker.
        const MAX_PASSES = 5;
        try {
          let claimed = 0;
          let passes = 0;
          const results: unknown[] = [];
          do {
            const result = await runSyncWorker(supabaseAdmin, { limit });
            claimed += result.claimed;
            results.push(...result.results);
            passes += 1;
            if (!drain || result.claimed === 0) break;
          } while (passes < MAX_PASSES);
          return Response.json({ ok: true, claimed, passes, results });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
