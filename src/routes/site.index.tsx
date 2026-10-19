import { createFileRoute } from "@tanstack/react-router";
import { loadCatalog, loadSummaries } from "@/lib/cordial-site/data";
import type { SiteBootstrap, SiteCatalog } from "@/lib/cordial-site/contract";
import { HomePage } from "@/components/cordial-site/HomePage";
export const Route = createFileRoute("/site/")({
  loader: async ({ abortController, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    const settings = (parent?.loaderData as SiteBootstrap | undefined)?.settings;
    const ids = settings?.featuredPropertyIds ?? [];
    const featured: Promise<SiteCatalog | null> = (
      ids.length
        ? loadSummaries(ids, abortController.signal).then(({ items }) => ({
            items: items.map((p) => ({ ...p, featured: true })),
            total: items.length,
            page: 1,
            pageSize: 9,
          }))
        : loadCatalog({ destaque: "sim" }, abortController.signal)
    ).catch(() => null);
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
