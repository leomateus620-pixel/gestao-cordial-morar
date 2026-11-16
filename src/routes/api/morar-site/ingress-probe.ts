import { createFileRoute } from "@tanstack/react-router";
import { ingressProbe } from "@/lib/ingress-probe/probe.server";

// TEMPORARY: remove after ingress validation.
export const Route = createFileRoute("/api/morar-site/ingress-probe")({
  server: { handlers: { GET: ({ request }) => ingressProbe(request) } },
});
