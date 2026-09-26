import { createFileRoute } from "@tanstack/react-router";
import { searchSchema } from "@/lib/cordial-site/contract";
import { loadCatalog } from "@/lib/cordial-site/data";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
import { ResultsPage } from "@/components/cordial-site/ResultsPage";
import { SiteError, SitePending } from "@/components/cordial-site/SiteShell";
export const Route = createFileRoute("/site/buscar")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps, abortController }) => loadCatalog(deps, abortController.signal),
  head: ({ matches }) =>
    siteHead(
      "Encontre seu imóvel",
      "Busque imóveis por finalidade, cidade, bairro, valor e características.",
      siteMatchData(matches),
      "/site/buscar",
      true,
    ),
  component: function SiteRoute() {
    return <ResultsPage result={Route.useLoaderData()} search={Route.useSearch()} />;
  },
  errorComponent: ({ reset }) => <SiteError reset={reset} />,
  pendingComponent: SitePending,
});
