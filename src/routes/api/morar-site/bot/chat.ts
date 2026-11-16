import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/morar-site/bot/chat")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (await import("@/lib/public-property-bot/http.server")).handlePublicBot(
          request,
          "morar",
          "chat",
        ),
    },
  },
});
