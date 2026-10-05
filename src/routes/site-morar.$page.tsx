import { createFileRoute, notFound } from "@tanstack/react-router";
import { EditorialPage } from "@/components/cordial-site/ContentPages";
import { loadPage } from "@/lib/cordial-site/morar-data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/morar-seo";
export const Route = createFileRoute("/site-morar/$page")({
  loader: async ({ params, abortController }) => {
    if (!["sobre", "financiamento", "correspondente", "privacidade"].includes(params.page))
      throw notFound();
    return await loadPage(params.page, abortController.signal);
  },
  head: ({ params, loaderData, matches }) =>
    siteHead(
      loaderData?.title ??
        {
          sobre: "Sobre a Morar",
          financiamento: "Financiamento",
          correspondente: "Correspondente bancário",
          privacidade: "Privacidade",
        }[params.page] ??
        "Morar",
      loaderData?.summary ?? "Conheça a Morar Imóveis e seus serviços.",
      siteMatchData(matches),
      `/site-morar/${params.page}`,
    ),
  component: function SiteRoute() {
    return <EditorialPage slug={Route.useParams().page} content={Route.useLoaderData()} />;
  },
});
