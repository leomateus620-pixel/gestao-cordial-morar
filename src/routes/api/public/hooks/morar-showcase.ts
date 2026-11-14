import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/hooks/morar-showcase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [
          { adminBookkeeping },
          { internalTokenAuthorized },
          { workerSecrets },
          { runShowcase },
          { runFeatured },
        ] = await Promise.all([
          import("@/lib/agent/delegation.server"),
          import("@/lib/workers/internal-token.server"),
          import("@/lib/workers/hook-auth"),
          import("@/lib/cordial-site/showcase.server"),
          import("@/lib/site-showcase/featured.server"),
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
          const db = adminBookkeeping();
          const now = new Date();
          const [showcase, featured] = await Promise.allSettled([
            runShowcase(db, now, "morar"),
            runFeatured(db, now, "morar"),
          ]);
          return Response.json(
            {
              showcase:
                showcase.status === "fulfilled"
                  ? showcase.value
                  : { error: "Vitrine indisponível." },
              featured:
                featured.status === "fulfilled"
                  ? featured.value
                  : { error: "Destaques indisponíveis." },
            },
            {
              status: showcase.status === "rejected" && featured.status === "rejected" ? 503 : 200,
            },
          );
        } catch {
          return Response.json({ error: "Não foi possível processar a vitrine." }, { status: 503 });
        }
      },
    },
  },
});
