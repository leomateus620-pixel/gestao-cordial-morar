import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/morar-site/bot/suggestions")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/lib/public-property-bot/http.server")).handlePublicBot(
          request,
          "morar",
          "suggestions",
        ),
    },
  },
});
