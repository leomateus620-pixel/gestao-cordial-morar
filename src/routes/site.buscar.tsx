import { useRef } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { searchSchema, type SiteCatalog, type SiteSearch } from "@/lib/cordial-site/contract";
import { loadCatalog } from "@/lib/cordial-site/data";
import { catalogSearch } from "@/lib/cordial-site/search-state";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
import { ResultsPage } from "@/components/cordial-site/ResultsPage";
import { SiteError, SitePending } from "@/components/cordial-site/SiteShell";
export const Route = createFileRoute("/site/buscar")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => catalogSearch(search),
  loader: async ({ deps, abortController }) => {
    try {
      return { result: await loadCatalog(deps, abortController.signal), failed: false };
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      return { result: null, failed: true };
    }
  },
  head: ({ matches }) =>
    siteHead(
      "Encontre seu imóvel",
      "Busque imóveis por finalidade, cidade, bairro, valor e características.",
      siteMatchData(matches),
      "/site/buscar",
      true,
    ),
  component: function SiteRoute() {
    const loaded = Route.useLoaderData();
    const search = Route.useSearch();
    const router = useRouter();
    const confirmed = useRef<{ result: SiteCatalog; search: SiteSearch } | null>(null);
    if (loaded.result) confirmed.current = { result: loaded.result, search };
    return (
      <ResultsPage
        result={
          loaded.result ??
          confirmed.current?.result ?? { items: [], total: 0, page: search.pagina, pageSize: 12 }
        }
        search={search}
        failed={loaded.failed}
        hasPrevious={!!confirmed.current}
        onRetry={() =>
          void router.invalidate({ filter: (match) => match.routeId === "/site/buscar" })
        }
      />
    );
  },
  errorComponent: ({ reset }) => <SiteError reset={reset} />,
  pendingMs: Infinity,
  pendingComponent: SitePending,
});
