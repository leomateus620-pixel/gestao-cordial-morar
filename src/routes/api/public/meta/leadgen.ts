import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/leadgen")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { metaWebhookChallenge } = await import("@/lib/ads/leadgen.webhook.server");
        const { configuredWebhookApps } = await import("@/lib/ads/leadgen.server");
        try {
          return metaWebhookChallenge(request, await configuredWebhookApps());
        } catch {
          return new Response("Configuration unavailable", { status: 503 });
        }
      },
      POST: async ({ request }) => {
        const { receiveMetaWebhook } = await import("@/lib/ads/leadgen.webhook.server");
        const { configuredWebhookApps, persistMetaEvents } =
          await import("@/lib/ads/leadgen.server");
        try {
          return receiveMetaWebhook(request, await configuredWebhookApps(), persistMetaEvents);
        } catch {
          return new Response("Configuration unavailable", { status: 503 });
        }
      },
    },
  },
});
