import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/assistant-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { oauthConfiguration, completeDelegation } =
          await import("@/lib/agent/delegation.server");
        const config = await oauthConfiguration();
        if (!config.origin) return new Response("Rotinas não configuradas.", { status: 503 });
        const url = new URL(request.url);
        let status = "erro";
        try {
          const code = url.searchParams.get("code"),
            state = url.searchParams.get("state");
          if (code && state) {
            await completeDelegation(code, state);
            status = "conectado";
          } else status = "cancelado";
        } catch {
          status = "erro";
        }
        return Response.redirect(`${config.origin}/assistente?delegation=${status}`, 303);
      },
    },
  },
});
