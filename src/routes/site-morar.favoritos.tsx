import { createFileRoute } from "@tanstack/react-router";
import { FavoritesPage } from "@/components/cordial-site/ContentPages";
import { siteHead, siteMatchData } from "@/lib/cordial-site/morar-seo";
export const Route = createFileRoute("/site-morar/favoritos")({
  head: ({ matches }) =>
    siteHead(
      "Seus favoritos",
      "Imóveis salvos neste navegador.",
      siteMatchData(matches),
      "/site-morar/favoritos",
      true,
    ),
  component: FavoritesPage,
});
