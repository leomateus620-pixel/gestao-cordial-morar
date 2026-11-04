// Shared home loader: same 5 + 15 selection for every brand, always scoped by brand.
import type { PublicProperty, SiteBootstrap } from "./contract";
import type { SiteBrand } from "./brand";
import { loadCatalog, loadShowcase, loadSummaries } from "./data";
import { HOME_FEATURED_LIMIT, HOME_MORE_LIMIT, selectFeatured, selectMore } from "./home-selection";
import type { HomeData } from "@/components/cordial-site/HomePage";

const MAX_PAGES = 4;

export async function loadHome(
  settings: SiteBootstrap["settings"] | undefined,
  signal: AbortSignal,
  brand: SiteBrand,
): Promise<HomeData> {
  const mode = settings?.featuredMode ?? "recentes";
  const editorialIds = mode === "editorial" ? (settings?.featuredPropertyIds ?? []).slice(0, HOME_FEATURED_LIMIT) : [];
  const extraIds = [...editorialIds];
  // Each brand reads only its own weekly showcase (separate tables, bucket and endpoint).
  const showcase = await loadShowcase(signal, brand).catch(() => null);
  if (showcase && !extraIds.includes(showcase.publicId)) extraIds.push(showcase.publicId);
  if (settings?.heroPropertyId && !extraIds.includes(settings.heroPropertyId)) extraIds.push(settings.heroPropertyId);
  const [summaries, ...firstPages] = await Promise.all([
    extraIds.length
      ? loadSummaries(extraIds, signal, brand).catch(() => ({ items: [] as PublicProperty[], missingIds: [] }))
      : { items: [] as PublicProperty[], missingIds: [] },
    loadCatalog({ ordem: "recentes", pagina: 1 }, signal, brand),
    loadCatalog({ ordem: "recentes", pagina: 2 }, signal, brand).catch(() => null),
  ]);
  const pages: PublicProperty[][] = firstPages.filter(Boolean).map((c) => c!.items);
  const recent = () => pages.flat();
  let featured = selectFeatured({ mode, editorialIds, editorial: summaries.items, recent: recent() });
  let more = selectMore(pages, featured.map((p) => p.id));
  const total = firstPages[0]!.total;
  for (
    let page = pages.length + 1;
    page <= MAX_PAGES && (featured.length < HOME_FEATURED_LIMIT || more.length < HOME_MORE_LIMIT) && recent().length < total;
    page++
  ) {
    const next = await loadCatalog({ ordem: "recentes", pagina: page }, signal, brand).catch(() => null);
    if (!next?.items.length) break;
    pages.push(next.items);
    featured = selectFeatured({ mode, editorialIds, editorial: summaries.items, recent: recent() });
    more = selectMore(pages, featured.map((p) => p.id));
  }
  const weekly = showcase ? summaries.items.find((p) => p.id === showcase.publicId && p.cover) : undefined;
  const heroChoice = weekly ?? summaries.items.find((p) => p.id === settings?.heroPropertyId && p.cover);
  const heroImage = weekly && showcase ? { url: showcase.imageUrl, focalX: showcase.focalX, focalY: showcase.focalY } : null;
  return { featured, more, hero: heroChoice ?? featured[0] ?? null, total, heroImage };
}
