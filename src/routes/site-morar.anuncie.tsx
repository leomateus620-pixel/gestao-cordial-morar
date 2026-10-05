import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/cordial-site/ContentPages";
import { siteHead, siteMatchData } from "@/lib/cordial-site/morar-seo";
export const Route = createFileRoute("/site-morar/anuncie")({
  head: ({ matches }) =>
    siteHead(
      "Anuncie seu imóvel",
      "Apresente seu imóvel para venda ou locação à Morar.",
      siteMatchData(matches),
      "/site-morar/anuncie",
    ),
  component: function SiteRoute() {
    return <ContactPage capture />;
  },
});
