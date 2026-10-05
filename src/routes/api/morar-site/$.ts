import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/morar-site/$")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/lib/cordial-site/http.server")).handleSiteRequest(request, "morar"),
      POST: async ({ request }) =>
        (await import("@/lib/cordial-site/http.server")).handleSiteRequest(request, "morar"),
    },
  },
});
