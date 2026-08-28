import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker da fila de marca-d'água das fotos.
 * Acionado no upload e pelo pg_cron; protegido por segredo compartilhado.
 * O lease fica no banco (property_image_claim_jobs), então execuções
 * concorrentes nunca processam a mesma foto.
 */
export const Route = createFileRoute("/api/public/hooks/property-image-worker")({
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

        let limit = 2;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = Math.min(3, Math.max(1, body.limit));
        } catch {
          // corpo vazio é válido
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runImageWorker } = await import("@/lib/imoveis/image-pipeline.server");

        try {
          const result = await runImageWorker(supabaseAdmin, { limit });
          // Enquanto sobrar fila, o próprio worker chama o próximo lote:
          // lotes pequenos nunca estouram tempo/memória e a fila drena sozinha.
          if (result.pending > 0 && result.claimed > 0) {
            void fetch(new URL(request.url).toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: provided },
              body: JSON.stringify({ limit }),
              signal: AbortSignal.timeout(1000),
            }).catch(() => undefined);
          }
          return Response.json({ ok: true, ...result });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});

