import { createFileRoute } from "@tanstack/react-router";
import { DistrictsPage } from "@/components/cordial-site/ContentPages";
import { loadPages } from "@/lib/cordial-site/data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/bairros")({
  loader: ({ abortController }) => loadPages("district", abortController.signal),
  head: ({ matches }) =>
    siteHead(
      "Explore os bairros",
      "Encontre imóveis por cidade e bairro.",
      siteMatchData(matches),
      "/site/bairros",
    ),
  component: function SiteRoute() {
    return <DistrictsPage pages={Route.useLoaderData()} />;
  },
});
