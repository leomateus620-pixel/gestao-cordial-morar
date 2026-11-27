import { createFileRoute } from "@tanstack/react-router";

async function audience({ request }: { request: Request }) {
  const { publicSiteAudience } = await import("@/lib/site-audience/http.server");
  return publicSiteAudience(request, "morar");
}

export const Route = createFileRoute("/api/morar-site/audience")({
  server: { handlers: { GET: audience, POST: audience } },
});
