import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

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
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;

        let limit = 2;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = Math.min(3, Math.max(1, body.limit));
        } catch {
          // corpo vazio é válido
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runImageWorker } = await import("@/lib/imoveis/image-pipeline.server");
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
