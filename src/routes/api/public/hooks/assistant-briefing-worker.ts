import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/hooks/assistant-briefing-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [
          { adminBookkeeping },
          { internalTokenAuthorized },
          { workerSecrets },
          { runAssistantRoutines },
        ] = await Promise.all([
          import("@/lib/agent/delegation.server"),
          import("@/lib/workers/internal-token.server"),
          import("@/lib/workers/hook-auth"),
          import("@/lib/agent/routines.worker.server"),
        ]);
        const candidate = request.headers.get("x-api-key") ?? request.headers.get("apikey");
        if (
          !candidate ||
          candidate.startsWith("sb_publishable_") ||
          (!workerSecrets().includes(candidate) &&
            !(await internalTokenAuthorized(adminBookkeeping(), candidate)))
        )
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          return Response.json(await runAssistantRoutines());
        } catch {
          return Response.json(
            { error: "Não foi possível processar as rotinas." },
            { status: 503 },
          );
        }
      },
    },
  },
});
