import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/cordial-site/ContentPages";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/anuncie")({
  head: ({ matches }) =>
    siteHead(
      "Anuncie seu imóvel",
      "Apresente seu imóvel para venda ou locação à Cordial.",
      siteMatchData(matches),
      "/site/anuncie",
    ),
  component: function SiteRoute() {
    return <ContactPage capture />;
  },
});
