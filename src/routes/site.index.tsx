import { createFileRoute } from "@tanstack/react-router";
import { loadCatalog, loadShowcase, loadSummaries } from "@/lib/cordial-site/data";
import type { PublicProperty, SiteBootstrap } from "@/lib/cordial-site/contract";
import { HomePage, type HomeData } from "@/components/cordial-site/HomePage";
import { HOME_FEATURED_LIMIT, HOME_MORE_LIMIT, selectFeatured, selectMore } from "@/lib/cordial-site/home-selection";

const MAX_PAGES = 4;

async function loadHome(settings: SiteBootstrap["settings"] | undefined, signal: AbortSignal): Promise<HomeData> {
  const mode = settings?.featuredMode ?? "recentes";
  const editorialIds = mode === "editorial" ? (settings?.featuredPropertyIds ?? []).slice(0, HOME_FEATURED_LIMIT) : [];
  const extraIds = [...editorialIds];
  const showcase = await loadShowcase(signal).catch(() => null);
  if (showcase && !extraIds.includes(showcase.publicId)) extraIds.push(showcase.publicId);
  if (settings?.heroPropertyId && !extraIds.includes(settings.heroPropertyId)) extraIds.push(settings.heroPropertyId);
  const [summaries, ...firstPages] = await Promise.all([
    extraIds.length ? loadSummaries(extraIds, signal).catch(() => ({ items: [], missingIds: [] })) : { items: [] as PublicProperty[], missingIds: [] },
    loadCatalog({ ordem: "recentes", pagina: 1 }, signal),
    loadCatalog({ ordem: "recentes", pagina: 2 }, signal).catch(() => null),
  ]);
  const pages: PublicProperty[][] = firstPages.filter(Boolean).map((c) => c!.items);
  const recent = () => pages.flat();
  let featured = selectFeatured({ mode, editorialIds, editorial: summaries.items, recent: recent() });
  let more = selectMore(pages, featured.map((p) => p.id));
  const total = firstPages[0]!.total;
  // Percorre páginas extras com limite explícito até completar 5 + 15 elegíveis.
  for (let page = pages.length + 1; page <= MAX_PAGES && (featured.length < HOME_FEATURED_LIMIT || more.length < HOME_MORE_LIMIT) && recent().length < total; page++) {
    const next = await loadCatalog({ ordem: "recentes", pagina: page }, signal).catch(() => null);
    if (!next?.items.length) break;
    pages.push(next.items);
    featured = selectFeatured({ mode, editorialIds, editorial: summaries.items, recent: recent() });
    more = selectMore(pages, featured.map((p) => p.id));
  }
  // Vitrine semanal (validada no banco) tem prioridade; depois a escolha manual antiga; depois o 1º destaque.
  const weekly = showcase ? summaries.items.find((p) => p.id === showcase.publicId && p.cover) : undefined;
  const heroChoice = weekly ?? summaries.items.find((p) => p.id === settings?.heroPropertyId && p.cover);
  const heroImage = weekly && showcase ? { url: showcase.imageUrl, focalX: showcase.focalX, focalY: showcase.focalY } : null;
  return { featured, more, hero: heroChoice ?? featured[0] ?? null, total, heroImage };
}

export const Route = createFileRoute("/site/")({
  loader: async ({ abortController, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    const settings = (parent?.loaderData as SiteBootstrap | undefined)?.settings;
    return { home: loadHome(settings, abortController.signal).catch(() => null) };
  },
  component: function SiteRoute() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
