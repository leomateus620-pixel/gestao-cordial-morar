import { createFileRoute } from "@tanstack/react-router";
import { FavoritesPage } from "@/components/cordial-site/ContentPages";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/favoritos")({
  head: ({ matches }) =>
    siteHead(
      "Seus favoritos",
      "Imóveis salvos neste navegador.",
      siteMatchData(matches),
      "/site/favoritos",
      true,
    ),
  component: FavoritesPage,
});
