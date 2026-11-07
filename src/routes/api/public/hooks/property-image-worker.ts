import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

/** Orçamento de uma execução: lotes paralelos pequenos até ~20 s. */
const BUDGET_MS = 20_000;

/**
 * Worker da fila de marca-d'água das fotos.
 * Acionado pelo banco (gatilho na fila + despachante privado) e pelo pg_cron
 * como vigia. O lease fica no banco (property_image_claim_jobs), então
 * execuções concorrentes nunca processam a mesma foto.
 */
export const Route = createFileRoute("/api/public/hooks/property-image-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;

        let limit = 3;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = Math.min(4, Math.max(1, body.limit));
        } catch {
          // corpo vazio é válido
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runImageWorker } = await import("@/lib/imoveis/image-pipeline.server");
          const started = Date.now();
          const total = { claimed: 0, processed: 0, failed: 0, pending: 0, rounds: 0 };
          // Continua no mesmo pedido enquanto houver fila e tempo; não depende
          // de trabalho após a resposta (a hospedagem pode encerrá-lo).
          while (Date.now() - started < BUDGET_MS) {
            const r = await runImageWorker(supabaseAdmin, { limit, skipRecovery: total.rounds > 0 });
            total.rounds += 1;
            total.claimed += r.claimed;
            total.processed += r.processed;
            total.failed += r.failed;
            total.pending = r.pending;
            if (r.claimed === 0 || r.pending === 0) break;
          }
          if (total.pending > 0 && total.claimed > 0) {
            // Continuação durável pelo banco (URL fixa e credencial do cofre).
            await supabaseAdmin
              .rpc("property_worker_dispatch" as never, {
                _hook: "property-image-worker",
                _body: { limit },
              } as never)
              .then(undefined, () => undefined);
          }
          return Response.json({ ok: true, ...total, ms: Date.now() - started });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
