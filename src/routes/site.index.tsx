import { createFileRoute } from "@tanstack/react-router";
import { loadCatalog, loadSummaries } from "@/lib/cordial-site/data";
import type { SiteBootstrap, SiteCatalog } from "@/lib/cordial-site/contract";
import { HomePage } from "@/components/cordial-site/HomePage";
export const Route = createFileRoute("/site/")({
  loader: async ({ abortController, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    const settings = (parent?.loaderData as SiteBootstrap | undefined)?.settings;
    // Destaques = sempre os 5 imóveis publicados mais recentemente no site.
    const featured: Promise<SiteCatalog | null> = loadCatalog(
      { ordem: "recentes" },
      abortController.signal,
    )
      .then((catalog) => {
        const items = catalog.items.slice(0, 5).map((p) => ({ ...p, featured: true }));
        return { ...catalog, items, total: items.length, page: 1, pageSize: 5 };
      })
      .catch(() => null);
    return {
      featured,
      choices: featured.then(async (selected) => {
        const picks = selected?.items ?? [];
        if (settings?.heroPropertyId && !picks.some((p) => p.id === settings.heroPropertyId)) {
          const chosen = await loadSummaries(
            [settings.heroPropertyId],
            abortController.signal,
          ).catch(() => ({ items: [] }));
          if (chosen.items[0]?.cover) return [...chosen.items, ...picks];
        }
        if (picks.some((p) => p.cover)) return picks;
        const latest = await loadCatalog({}, abortController.signal).catch(() => null);
        return [...picks, ...(latest?.items ?? [])];
      }),
    };
  },
  component: function SiteRoute() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
