import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/cordial-site/$")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/lib/cordial-site/http.server")).handleSiteRequest(request),
      POST: async ({ request }) =>
        (await import("@/lib/cordial-site/http.server")).handleSiteRequest(request),
    },
  },
});
