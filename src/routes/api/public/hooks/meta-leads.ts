import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

/** Cron callers use public.internal_worker_headers() (vault credential); manual callers may use WORKER_HOOK_SECRET. */
export const Route = createFileRoute("/api/public/hooks/meta-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { internalTokenAuthorized } = await import("@/lib/workers/internal-token.server");
        const token = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const vaultOk = await internalTokenAuthorized(
          supabaseAdmin as unknown as Parameters<typeof internalTokenAuthorized>[0],
          token,
        );
        if (!vaultOk) {
          const denied = authorizeWorkerRequest(request);
          if (denied) return denied;
        }
        try {
          const { runMetaLeadWorker } = await import("@/lib/ads/leadgen.server");
          return Response.json({ ok: true, ...(await runMetaLeadWorker()) });
        } catch {
          return Response.json(
            { ok: false, error: "Meta lead worker unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
