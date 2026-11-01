import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/hooks/realce-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ adminBookkeeping }, { internalTokenAuthorized }, { workerSecrets }, { runRealce, cleanupRealce }] =
          await Promise.all([
            import("@/lib/agent/delegation.server"),
            import("@/lib/workers/internal-token.server"),
            import("@/lib/workers/hook-auth"),
            import("@/lib/realce/worker.server"),
          ]);
        const candidate = request.headers.get("x-api-key") ?? request.headers.get("apikey");
        if (
          !candidate ||
          candidate.startsWith("sb_publishable_") ||
          (!workerSecrets().includes(candidate) && !(await internalTokenAuthorized(adminBookkeeping(), candidate)))
        )
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const admin = adminBookkeeping();
          const result = await runRealce(admin, { limit: 2 });
          await cleanupRealce(admin).catch(() => undefined);
          return Response.json(result);
        } catch {
          return Response.json({ error: "Não foi possível processar o Realce." }, { status: 503 });
        }
      },
    },
  },
});
