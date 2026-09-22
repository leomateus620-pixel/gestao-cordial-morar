import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

/**
 * Worker da fila de FOTOS dos imóveis (ImobiBrasil).
 *
 * Separado do worker cadastral (correção 18/09/2026): mídia é lenta (limite de
 * requisições por site + upload sequencial) e, quando um único request atendia
 * cadastro e fotos juntos, um estouro de tempo deixava todos os jobs já
 * reivindicados presos em `processing`.
 *
 * Aqui o claim é filtrado em `media_sync` e processa UM job por execução.
 * Nunca chama `/imovel/alterar` — só recursos de imagem.
 */
export const Route = createFileRoute("/api/public/hooks/property-media-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!accepted.includes(provided)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let passes = 1;
        try {
          const body = (await request.json()) as { passes?: number } | null;
          if (body && typeof body.passes === "number") {
            passes = Math.min(3, Math.max(1, Math.floor(body.passes)));
          }
        } catch {
          // corpo vazio é válido
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSyncWorker } = await import("@/lib/imobibrasil/sync.server");

        try {
          let claimed = 0;
          const results: unknown[] = [];
          for (let pass = 0; pass < passes; pass += 1) {
            const result = await runSyncWorker(supabaseAdmin, { kind: "media", limit: 1 });
            claimed += result.claimed;
            results.push(...result.results);
            if (result.claimed === 0) break;
          }
          return Response.json({ ok: true, kind: "media", claimed, results });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
