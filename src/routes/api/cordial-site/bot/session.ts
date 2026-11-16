import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/cordial-site/bot/session")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (await import("@/lib/public-property-bot/http.server")).handlePublicBot(
          request,
          "cordial",
          "session",
        ),
    },
  },
});
