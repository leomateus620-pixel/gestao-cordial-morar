import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest, workerCallerSecret } from "@/lib/workers/hook-auth";

/**
 * Worker da fila do Google Drive (Etapa 8).
 * Acionado pelo cadastro e pelo pg_cron; o lease fica no banco, então
 * execuções concorrentes nunca processam o mesmo imóvel.
 */
export const Route = createFileRoute("/api/public/hooks/property-drive-worker")({
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDriveWorker } = await import("@/lib/imoveis/drive/property-drive.server");

        try {
          const result = await runDriveWorker(supabaseAdmin, { limit });
          // Cada execução envia só um bloco de arquivos; se ainda houver imóvel
          // na fila, o próprio worker chama o próximo bloco.
          const { count } = await supabaseAdmin
            .from("property_drive_jobs")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "retry"]);
          if ((count ?? 0) > 0 && result.claimed > 0) {
            void fetch(new URL(request.url).toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: workerCallerSecret() ?? "" },
              body: JSON.stringify({ limit }),
              signal: AbortSignal.timeout(1000),
            }).catch(() => undefined);
          }
          return Response.json({ ok: true, pending: count ?? 0, ...result });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }

      },
    },
  },
});
