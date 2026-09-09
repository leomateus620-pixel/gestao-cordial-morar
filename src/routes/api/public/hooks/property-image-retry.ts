import { createFileRoute } from "@tanstack/react-router";

/**
 * Reenvio automático das fotos que falharam e retomada das publicações
 * incompletas. Acionado por pg_cron; protegido por segredo compartilhado.
 * Nunca depende de clique do usuário.
 */
export const Route = createFileRoute("/api/public/hooks/property-image-retry")({
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

        let limit = 25;
        let backfillLimit = 25;
        try {
          const body = (await request.json()) as
            | { limit?: number; backfillLimit?: number }
            | null;
          if (typeof body?.limit === "number") limit = Math.min(100, Math.max(1, body.limit));
          if (typeof body?.backfillLimit === "number")
            backfillLimit = Math.min(100, Math.max(0, body.backfillLimit));
        } catch {
          // corpo vazio é válido
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runImageDeliverySweep } = await import("@/lib/imobibrasil/image-retry.server");
          const result = await runImageDeliverySweep(supabaseAdmin, { limit, backfillLimit });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ ok: false, error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
