import { createFileRoute } from "@tanstack/react-router";
import { NewsPage } from "@/components/cordial-site/ContentPages";
import { loadPages } from "@/lib/cordial-site/morar-data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/morar-seo";
export const Route = createFileRoute("/site-morar/noticias/")({
  loader: ({ abortController }) => loadPages("news", abortController.signal),
  head: ({ matches }) =>
    siteHead(
      "Notícias",
      "Conteúdos publicados pela equipe Morar.",
      siteMatchData(matches),
      "/site-morar/noticias",
    ),
  component: function SiteRoute() {
    return <NewsPage pages={Route.useLoaderData()} />;
  },
});
