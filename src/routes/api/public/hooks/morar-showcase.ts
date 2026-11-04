import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/hooks/morar-showcase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ adminBookkeeping }, { internalTokenAuthorized }, { workerSecrets }, { runShowcase }] =
          await Promise.all([
            import("@/lib/agent/delegation.server"),
            import("@/lib/workers/internal-token.server"),
            import("@/lib/workers/hook-auth"),
            import("@/lib/cordial-site/showcase.server"),
          ]);
        const candidate = request.headers.get("x-api-key") ?? request.headers.get("apikey");
        if (
          !candidate ||
          candidate.startsWith("sb_publishable_") ||
          (!workerSecrets().includes(candidate) && !(await internalTokenAuthorized(adminBookkeeping(), candidate)))
        )
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          return Response.json(await runShowcase(adminBookkeeping(), new Date(), "morar"));
        } catch {
          return Response.json({ error: "Não foi possível processar a vitrine." }, { status: 503 });
        }
      },
    },
  },
});
