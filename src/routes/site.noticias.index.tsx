import { createFileRoute } from "@tanstack/react-router";
import { NewsPage } from "@/components/cordial-site/ContentPages";
import { loadPages } from "@/lib/cordial-site/data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/noticias/")({
  loader: ({ abortController }) => loadPages("news", abortController.signal),
  head: ({ matches }) =>
    siteHead(
      "Notícias",
      "Conteúdos publicados pela equipe Cordial.",
      siteMatchData(matches),
      "/site/noticias",
    ),
  component: function SiteRoute() {
    return <NewsPage pages={Route.useLoaderData()} />;
  },
});
