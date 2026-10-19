import { createFileRoute } from "@tanstack/react-router";
import { internalTokenAuthorized } from "@/lib/workers/internal-token.server";

/** Bounded pre-generation outside public navigation. Cron callers use internal_worker_headers(). */
export const Route = createFileRoute("/api/public/hooks/site-media-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { siteDb } = await import("@/lib/cordial-site/service.server");
        const db = siteDb();
        const token = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!(await internalTokenAuthorized(db, token)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const { data, error } = await db
            .from("public_site_derivative_candidates")
            .select("brand,id,version,size")
            .order("priority")
            .order("id")
            .order("size")
            .limit(2);
          if (error) throw new Error("Preparation unavailable");
          const { mediaResponse } = await import("@/lib/cordial-site/http.server");
          let prepared = 0;
          for (const item of data ?? []) {
            if (item.brand !== "cordial" && item.brand !== "morar") continue;
            const result = await mediaResponse(item.id, item.version, item.size, item.brand);
            if (result.ok) prepared++;
            await result.body?.cancel();
          }
          return Response.json(
            { ok: true, prepared },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json({ error: "Preparação de imagens indisponível." }, { status: 503 });
        }
      },
    },
  },
});
