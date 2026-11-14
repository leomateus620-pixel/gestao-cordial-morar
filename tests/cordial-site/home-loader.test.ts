import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  PublicProperty,
  SiteCatalog,
  SiteSettings,
} from "../../src/lib/cordial-site/contract";
import type { PublicShowcase } from "../../src/lib/cordial-site/data";
import { loadHome } from "../../src/lib/cordial-site/home-loader";

function property(n: number, hasCover = true): PublicProperty {
  return {
    id: String(n),
    operation: n % 2 ? "venda" : "aluguel",
    cover: hasCover ? { id: String(n), version: "v1" } : null,
    photoCount: hasCover ? 2 : 0,
  } as PublicProperty;
}

function catalog(page: number, total = 24): SiteCatalog {
  const offset = (page - 1) * 12;
  const length = Math.max(0, Math.min(12, total - offset));
  return {
    page,
    total,
    pageSize: 12,
    items: Array.from({ length }, (_, i) => property(offset + i + 1)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function options(partial: Partial<SiteSettings>) {
  return partial as SiteSettings;
}

const signal = new AbortController().signal;
const showcase: PublicShowcase = {
  publicId: "30",
  imageUrl: "/approved-image",
  focalX: 0.3,
  focalY: 0.4,
};

test("weekly highlights keep the five slots, use only matching treated covers and preserve 15 distinct extras", async () => {
  const weekly = [30, 31, 32, 33, 34].map((id, i) => ({
    slot: i + 1,
    public_id: String(id),
    media_id: String(id),
    media_version: i === 1 ? "old" : "v1",
    checksum: "b".repeat(64),
    ordinal: 0,
  }));
  const home = loadHome(Promise.resolve(options({})), signal, "cordial", {
    loadCatalog: async ({ pagina }) => catalog(pagina!),
    loadShowcase: async () => null,
    loadFeatured: async () => weekly,
    loadSummaries: async (ids) => ({
      items: ids.map((id) => property(Number(id))),
      missingIds: [],
    }),
  });
  const listing = await home.listings;
  assert.deepEqual(
    listing?.featured.map((p) => p.id),
    ["30", "31", "32", "33", "34"],
  );
  assert.equal(listing?.featured[0].cover?.enhancement, "b".repeat(64));
  assert.equal(listing?.featured[1].cover?.enhancement, undefined);
  assert.equal(listing?.more.length, 15);
  assert.equal(new Set([...listing!.featured, ...listing!.more].map((p) => p.id)).size, 20);
});

test("unavailable weekly treatment falls back to the existing home selection", async () => {
  const home = loadHome(Promise.resolve(options({})), signal, "morar", {
    loadCatalog: async ({ pagina }) => catalog(pagina!),
    loadShowcase: async () => null,
    loadFeatured: async () => {
      throw new Error("temporarily unavailable");
    },
    loadSummaries: async () => ({ items: [], missingIds: [] }),
  });
  assert.deepEqual(
    (await home.listings)?.featured.map((p) => p.id),
    ["1", "2", "3", "4", "5"],
  );
});

test("a stalled treatment lookup is bounded and cannot hold the home indefinitely", async () => {
  let treatmentSignal: AbortSignal | undefined;
  const home = loadHome(Promise.resolve(options({})), signal, "cordial", {
    loadCatalog: async ({ pagina }) => catalog(pagina!),
    loadShowcase: async () => null,
    loadFeatured: async (signal) => {
      treatmentSignal = signal;
      return new Promise(() => {});
    },
    loadSummaries: async () => ({ items: [], missingIds: [] }),
  });
  assert.equal((await home.listings)?.featured.length, 5);
  assert.equal(treatmentSignal?.aborted, true);
});

test("home starts both catalog pages and the brand's showcase before settings; listings never wait for showcase", async () => {
  const settings = deferred<SiteSettings>();
  const weekly = deferred<PublicShowcase | null>();
  const callers: string[] = [];
  const home = loadHome(settings.promise, signal, "morar", {
    async loadCatalog({ pagina }, activeSignal, brand) {
      assert.equal(activeSignal, signal);
      callers.push(`${brand}:${pagina}`);
      return catalog(pagina!);
    },
    loadShowcase(_signal, brand) {
      callers.push(`${brand}:showcase`);
      return weekly.promise;
    },
    async loadSummaries() {
      throw new Error("No property requires a summary");
    },
  });

  assert.deepEqual(callers, ["morar:1", "morar:2", "morar:showcase"]);
  settings.resolve(options({}));
  const results = await home.listings;
  assert.deepEqual(
    results?.featured.map(({ id }) => id),
    ["1", "2", "3", "4", "5"],
  );
  assert.deepEqual(
    results?.more.map(({ id }) => Number(id)),
    Array.from({ length: 15 }, (_, i) => i + 6),
  );
  weekly.resolve(null);
  assert.equal((await home.hero)?.property.id, "1");
});

test("an approved weekly hero resolves while settings and both catalog pages are pending", async () => {
  const settings = deferred<SiteSettings>();
  const first = deferred<SiteCatalog>();
  const second = deferred<SiteCatalog>();
  const home = loadHome(settings.promise, signal, "cordial", {
    loadCatalog: ({ pagina }) => (pagina === 1 ? first.promise : second.promise),
    loadShowcase: async () => showcase,
    async loadSummaries(ids, _signal, brand) {
      assert.equal(brand, "cordial");
      return { items: ids.map(Number).map((n) => property(n)), missingIds: [] };
    },
  });
  const hero = await home.hero;
  assert.equal(hero?.property.id, showcase.publicId);
  assert.deepEqual(hero?.image, { url: "/approved-image", focalX: 0.3, focalY: 0.4 });
  settings.resolve(options({}));
  first.resolve(catalog(1));
  second.resolve(catalog(2));
  assert.equal((await home.listings)?.featured.length, 5);
});

test("a withdrawn weekly property yields to the manual hero before the second page; confirmed empty has no old hero", async () => {
  const second = deferred<SiteCatalog>();
  const readCatalog: Parameters<typeof loadHome>[3] = {
    loadCatalog: async ({ pagina }) => (pagina === 1 ? catalog(1, 0) : second.promise),
    loadShowcase: async () => showcase,
    loadSummaries: async (ids) =>
      ids.includes("31")
        ? { items: [property(31)], missingIds: [] }
        : { items: [], missingIds: ids },
  };

  const withManual = loadHome(
    Promise.resolve(options({ heroPropertyId: "31" })),
    signal,
    "morar",
    readCatalog,
  );
  assert.deepEqual(await withManual.hero, { property: property(31), image: null });
  second.resolve(catalog(2, 0));
  await withManual.listings;
  const next = loadHome(
    Promise.resolve(options({ heroPropertyId: "32" })),
    signal,
    "morar",
    readCatalog,
  );
  assert.equal(await next.hero, null);
  assert.deepEqual(await next.listings, { featured: [], more: [] });
});

test("a reserved mix keeps the same first featured property while additional pages are read", async () => {
  const pages = [1, 2, 3, 4];
  const home = loadHome(
    Promise.resolve(options({ featuredMix: { venda: 0, aluguel: 5 } })),
    signal,
    "cordial",
    {
      async loadCatalog({ pagina = 1 }) {
        assert.equal(pagina, pages.shift());
        const result = catalog(pagina, 48);
        if (pagina <= 2)
          result.items = result.items.map((p, i) => ({ ...p, cover: i === 0 ? p.cover : null }));
        return result;
      },
      loadShowcase: async () => null,
      loadSummaries: async () => ({ items: [], missingIds: [] }),
    },
  );
  assert.equal((await home.hero)?.property.id, "26");
  assert.deepEqual(
    (await home.listings)?.featured.map(({ id }) => id),
    ["26", "28", "30", "32", "34"],
  );
  assert.deepEqual(pages, [4]);
});

test("home streams all five selected galleries without delaying hero or listings", async () => {
  const metadata = deferred<ReturnType<typeof property>["cover"][]>();
  const galleryIds: string[] = [];
  const home = loadHome(Promise.resolve(options({})), signal, "morar", {
    loadCatalog: async ({ pagina }) => catalog(pagina!),
    loadShowcase: async () => null,
    loadSummaries: async () => ({ items: [], missingIds: [] }),
    async loadGallery(id, activeSignal, brand) {
      assert.equal(activeSignal?.aborted, false);
      assert.equal(brand, "morar");
      galleryIds.push(id);
      await metadata.promise;
      if (id === "3") throw new Error("unavailable");
      return [property(Number(id)).cover!];
    },
  });
  assert.equal((await home.hero)?.property.id, "1");
  assert.equal((await home.listings)?.featured.length, 5);
  assert.deepEqual(galleryIds, ["1", "2", "3", "4", "5"]);
  metadata.resolve([]);
  assert.deepEqual(
    (await Promise.all(Object.values(await home.featuredGalleries)))
      .filter((h) => h !== null)
      .map((h) => h.propertyId),
    ["1", "2", "4", "5"],
  );
});

test("editorial/mixed homes prepare the actual five, never unrelated catalog cards", async () => {
  const galleryIds: string[] = [];
  const home = loadHome(
    Promise.resolve(
      options({ featuredMode: "editorial", featuredPropertyIds: ["31", "32", "33", "34", "35"] }),
    ),
    signal,
    "cordial",
    {
      loadCatalog: async ({ pagina }) => catalog(pagina!),
      loadShowcase: async () => null,
      loadSummaries: async (ids) => ({
        items: ids.map(Number).map((n) => property(n)),
        missingIds: [],
      }),
      async loadGallery(id) {
        galleryIds.push(id);
        return [property(Number(id)).cover!];
      },
    },
  );
  const hints = (await Promise.all(Object.values(await home.featuredGalleries))).filter(
    (h) => h !== null,
  );
  assert.deepEqual(
    galleryIds,
    (await home.listings)?.featured.map((p) => p.id),
  );
  assert.deepEqual(
    hints.map((h) => h.propertyId),
    ["31", "32", "33", "34", "35"],
  );
});

test("a slow featured gallery does not hold back the other four streamed hints", async () => {
  const slow = deferred<NonNullable<PublicProperty["cover"]>[]>();
  const home = loadHome(Promise.resolve(options({})), signal, "morar", {
    loadCatalog: async ({ pagina }) => catalog(pagina!),
    loadShowcase: async () => null,
    loadSummaries: async () => ({ items: [], missingIds: [] }),
    loadGallery: async (id) => (id === "1" ? slow.promise : [property(Number(id)).cover!]),
  });
  const hints = await home.featuredGalleries;
  assert.equal((await hints["5"])?.propertyId, "5");
  slow.resolve([]);
  assert.deepEqual((await hints["1"])?.items, []);
});
