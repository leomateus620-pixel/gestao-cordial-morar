import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

export const Route = createFileRoute("/api/public/hooks/meta-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;
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
