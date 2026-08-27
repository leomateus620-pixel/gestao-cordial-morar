import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker da fila de importação dos catálogos ImobiBrasil.
 * Protegido por segredo compartilhado. O lock/lease fica no banco
 * (property_import_claim_jobs), então execuções concorrentes nunca
 * processam o mesmo job. Ao final, se ainda houver fila, o worker
 * dispara a si mesmo — o progresso não depende do navegador aberto.
 */
export const Route = createFileRoute("/api/public/hooks/property-import-worker")({
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

        let limit = 4;
        let chain = true;
        try {
          const body = (await request.json()) as { limit?: number; chain?: boolean } | null;
          if (body && typeof body.limit === "number") limit = Math.min(10, Math.max(1, body.limit));
          if (body && typeof body.chain === "boolean") chain = body.chain;
        } catch {
          // corpo vazio é válido
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runImportWorker } = await import("@/lib/imobibrasil/import.server");

        try {
          const result = await runImportWorker(supabaseAdmin, { limit });
          if (chain && result.remaining > 0) {
            const origin = new URL(request.url).origin;
            // Continuação assíncrona: mantém a fila andando sem prender esta requisição.
            void fetch(`${origin}/api/public/hooks/property-import-worker`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: provided },
              body: JSON.stringify({ limit, chain: true }),
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
