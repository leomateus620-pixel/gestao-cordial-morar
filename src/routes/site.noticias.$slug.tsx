import { createFileRoute, notFound } from "@tanstack/react-router";
import { EditorialPage } from "@/components/cordial-site/ContentPages";
import { loadPage } from "@/lib/cordial-site/data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/noticias/$slug")({
  loader: async ({ params, abortController }) => {
    const p = await loadPage(params.slug, abortController.signal);
    if (!p || p.kind !== "news") throw notFound();
    return p;
  },
  head: ({ loaderData, matches, params }) =>
    siteHead(
      loaderData?.title ?? "Notícia",
      loaderData?.summary ?? "",
      siteMatchData(matches),
      `/site/noticias/${params.slug}`,
    ),
  component: function SiteRoute() {
    return <EditorialPage slug={Route.useParams().slug} content={Route.useLoaderData()} />;
  },
});
