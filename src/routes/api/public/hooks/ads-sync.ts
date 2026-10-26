import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";
import { runAdsSyncWorker } from "@/lib/ads/sync.server";
export const Route = createFileRoute("/api/public/hooks/ads-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;
        try {
          return Response.json(await runAdsSyncWorker());
        } catch {
          return Response.json(
            { error: "Não foi possível executar a sincronização." },
            { status: 503 },
          );
        }
      },
    },
  },
});
