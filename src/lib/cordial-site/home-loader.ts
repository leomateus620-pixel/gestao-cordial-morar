import type { PublicProperty, SiteSettings } from "./contract";
import type { SiteBrand } from "./brand";
import type { CardGalleryHint } from "./card-gallery";
import { loadCatalog, loadGallery, loadShowcase, loadSummaries, loadFeatured } from "./data";
import { HOME_FEATURED_LIMIT, HOME_MORE_LIMIT, selectFeatured, selectMore } from "./home-selection";

const MAX_PAGES = 4;
const publicReads = { loadCatalog, loadShowcase, loadSummaries, loadGallery, loadFeatured };

export type HomeHeroData = {
  property: PublicProperty;
  /** An approved weekly edit can have its own URL and focal point. */
  image: { url: string | null; focalX: number; focalY: number } | null;
};

type HomeListings = { featured: PublicProperty[]; more: PublicProperty[] };

export type HomeData = {
  hero: Promise<HomeHeroData | null>;
  listings: Promise<HomeListings | null>;
  featuredGalleries: Promise<Record<string, Promise<CardGalleryHint | null>>>;
};

/** Both sections can stream as soon as their own authoritative reads are ready. */
export function loadHome(
  settings: Promise<SiteSettings | undefined>,
  signal: AbortSignal,
  brand: SiteBrand,
  reads: Omit<typeof publicReads, "loadGallery" | "loadFeatured"> &
    Partial<Pick<typeof publicReads, "loadGallery" | "loadFeatured">> = publicReads,
): HomeData {
  const catalog = (pagina: number) =>
    reads.loadCatalog({ ordem: "recentes", pagina }, signal, brand).catch(() => null);
  // Start all brand-specific reads that do not depend on the parent layout.
  // An optional weekly treatment must not stall the existing catalog if its read is unavailable.
  const weeklyFeatured = new Promise<Awaited<ReturnType<typeof loadFeatured>>>((resolve) => {
    if (!reads.loadFeatured) return resolve([]);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve([]);
    }, 1_000);
    void reads
      .loadFeatured(AbortSignal.any([signal, controller.signal]), brand)
      .then(resolve, () => resolve([]))
      .finally(() => clearTimeout(timer));
  });
  const firstPage = catalog(1);
  const secondPage = catalog(2);
  const weeklyHero = reads
    .loadShowcase(signal, brand)
    .then(async (showcase): Promise<HomeHeroData | null> => {
      if (!showcase) return null;
      const { items } = await reads.loadSummaries([showcase.publicId], signal, brand);
      const property = items.find((p) => p.id === showcase.publicId && p.cover);
      return property
        ? {
            property,
            image: { url: showcase.imageUrl, focalX: showcase.focalX, focalY: showcase.focalY },
          }
        : null;
    })
    .catch(() => null);

  const config = Promise.all([settings, weeklyFeatured])
    .then(async ([settings, weekly]) => {
      const weeklyIds = [...new Set(weekly.map((p) => p.public_id))];
      const mode = weeklyIds.length ? "editorial" : (settings?.featuredMode ?? "recentes");
      const editorialIds =
        mode === "editorial"
          ? (weeklyIds.length ? weeklyIds : (settings?.featuredPropertyIds ?? [])).slice(
              0,
              HOME_FEATURED_LIMIT,
            )
          : [];
      const manualId = settings?.heroPropertyId;
      const ids = [...new Set(manualId ? [...editorialIds, manualId] : editorialIds)];
      const summaries = ids.length
        ? await reads.loadSummaries(ids, signal, brand).catch(() => null)
        : null;
      return {
        mode,
        editorialIds,
        editorial: (summaries?.items ?? []).map((p) => {
          const edit = weekly.find(
            (m) => m.media_id === p.cover?.id && m.media_version === p.cover?.version,
          );
          return edit && p.cover ? { ...p, cover: { ...p.cover, enhancement: edit.checksum } } : p;
        }),
        mix: settings?.featuredMix,
        manualHero: summaries?.items.find((p) => p.id === manualId && p.cover),
      };
    })
    .catch(() => null);

  const listings = Promise.all([config, firstPage, secondPage])
    .then(async ([settings, first, second]) => {
      if (!settings || !first) return null;

      const pages = second ? [first.items, second.items] : [first.items];
      let page = pages.length;
      for (;;) {
        const recent = pages.flat();
        const featured = selectFeatured({ ...settings, recent });
        const more = selectMore(
          pages,
          featured.map((p) => p.id),
        );
        if (
          (featured.length >= HOME_FEATURED_LIMIT && more.length >= HOME_MORE_LIMIT) ||
          recent.length >= first.total ||
          page >= MAX_PAGES ||
          signal.aborted
        )
          return { featured, more };

        const next = await catalog(++page);
        if (!next?.items.length) return { featured, more };
        pages.push(next.items);
      }
    })
    .catch(() => null);

  const hero = weeklyHero
    .then(async (weekly) => {
      if (weekly) return weekly;
      const settings = await config;
      if (!settings) return null;

      let property: PublicProperty | undefined =
        settings.manualHero ?? selectFeatured({ ...settings, recent: [] }).at(0);
      if (!property && !settings.mix?.venda && !settings.mix?.aluguel) {
        property = (await firstPage)?.items.find((p) => p.cover);
      }
      // A reserved operation mix can change the first featured property when another page arrives.
      property ??= (await listings)?.featured[0];
      return property ? { property, image: null } : null;
    })
    .catch(() => null);

  const connection = (
    globalThis.navigator as
      | (Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
        })
      | undefined
  )?.connection;
  // Stream metadata for the actual five selected cards, including editorial/mixed homes.
  // This never blocks the hero or listings and does not transfer any image bytes.
  const featuredGalleries = listings
    .then((selection): Record<string, Promise<CardGalleryHint | null>> => {
      if (
        !reads.loadGallery ||
        connection?.saveData ||
        connection?.effectiveType === "2g" ||
        connection?.effectiveType === "slow-2g" ||
        signal.aborted
      )
        return {};
      return Object.fromEntries(
        (selection?.featured ?? []).map((property) => [
          property.id,
          (async (): Promise<CardGalleryHint | null> => {
            if (!property.cover || property.photoCount < 2) return null;
            try {
              return {
                propertyId: property.id,
                coverRevision: `${property.cover.id}:${property.cover.version}${property.cover.enhancement ? `:${property.cover.enhancement}` : ""}`,
                items: await reads.loadGallery!(
                  property.id,
                  AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
                  brand,
                ),
              };
            } catch {
              return null; // One unavailable gallery must not discard the other four.
            }
          })(),
        ]),
      );
    })
    .catch(() => ({}));

  return { hero, listings, featuredGalleries };
}
