import { createFileRoute, notFound } from "@tanstack/react-router";
import { EditorialPage } from "@/components/cordial-site/ContentPages";
import { loadPage } from "@/lib/cordial-site/data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/$page")({
  loader: async ({ params, abortController }) => {
    if (!["sobre", "financiamento", "correspondente", "privacidade"].includes(params.page))
      throw notFound();
    return await loadPage(params.page, abortController.signal);
  },
  head: ({ params, loaderData, matches }) =>
    siteHead(
      loaderData?.title ??
        {
          sobre: "Sobre a Cordial",
          financiamento: "Financiamento",
          correspondente: "Correspondente bancário",
          privacidade: "Privacidade",
        }[params.page] ??
        "Cordial",
      loaderData?.summary ?? "Conheça a Cordial Imóveis e seus serviços.",
      siteMatchData(matches),
      `/site/${params.page}`,
    ),
  component: function SiteRoute() {
    return <EditorialPage slug={Route.useParams().page} content={Route.useLoaderData()} />;
  },
});
