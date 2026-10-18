import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSchema } from "../../src/lib/cordial-site/contract";
import {
  catalogSearch,
  foldSearchText,
  latestRequest,
  searchDraft,
  searchQueryKey,
  updateSearchDraft,
} from "../../src/lib/cordial-site/search-state";

test("presentation changes retain the same catalog dependency while filters and pages change it", () => {
  const base = searchSchema.parse({ cidade: "Santa Rosa", bairro: "Centro", precoMin: 0 });
  assert.deepEqual(catalogSearch(base), catalogSearch({ ...base, visualizacao: "lista" }));
  assert.equal(searchQueryKey(base), searchQueryKey({ ...base, visualizacao: "lista" }));
  assert.notEqual(searchQueryKey(base), searchQueryKey({ ...base, bairro: "Central" }));
  assert.notEqual(searchQueryKey(base), searchQueryKey({ ...base, pagina: 2 }));
});

test("the installed router preserves catalog reads and distinct history keys for presentation and preview/gallery navigation", async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const { createMemoryHistory, createRootRoute, createRoute, createRouter } =
    await import("@tanstack/react-router");
  if (previousEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnv;
  let reads = 0;
  const root = createRootRoute();
  const searchRoute = createRoute({
    getParentRoute: () => root,
    path: "/buscar",
    validateSearch: (input) => searchSchema.parse(input),
    loaderDeps: ({ search }) => catalogSearch(search),
    staleTime: 0,
    loader: () => {
      reads++;
      return { items: [], total: 0 };
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([searchRoute]),
    isServer: false,
    origin: "http://localhost",
    history: createMemoryHistory({
      initialEntries: [
        `/buscar?${new URLSearchParams(
          Object.entries(searchSchema.parse({ cidade: "Santa Rosa" }))
            .filter(([, value]) => value != null)
            .map(([key, value]) => [key, String(value)]),
        )}`,
      ],
    }),
  });
  await router.load();
  const before = reads;
  assert.equal(
    before,
    1,
    JSON.stringify({
      location: router.latestLocation,
      routes: Object.keys(router.routesById),
      matches: router.state.matches.map((match) => ({
        status: match.status,
        error: String(match.error),
      })),
    }),
  );
  await router.navigate({
    to: "/buscar",
    search: { ...searchSchema.parse({ cidade: "Santa Rosa" }), visualizacao: "lista" },
    resetScroll: false,
  });
  assert.equal(reads, before);
  const publicId = "10000000-0000-4000-8000-000000000001";
  const openingKey = "isolated-preview-opening";
  const catalogLocation = router.history.location;
  const catalogKey = catalogLocation.state.__TSR_key;
  const appliedSearch = router.latestLocation.search;
  await router.navigate({
    search: true,
    hash: `previa-${publicId}`,
    state: (current) => ({
      ...current,
      cordialSurface: publicId,
      cordialSurfaceKey: openingKey,
    }),
    resetScroll: false,
    hashScrollIntoView: false,
  });
  const previewKey = router.history.location.state.__TSR_key;
  assert.equal(reads, before, "opening the preview must not request the catalog");
  assert.deepEqual(router.latestLocation.search, appliedSearch);
  assert.equal(router.latestLocation.hash, `previa-${publicId}`);
  assert.ok(catalogKey && previewKey);
  assert.notEqual(previewKey, catalogKey, "an overlay must not reuse the catalog's scroll key");
  await router.navigate({
    search: true,
    hash: `galeria-${publicId}`,
    state: (current) => ({
      ...current,
      cordialSurface: publicId,
      cordialSurfaceKey: openingKey,
    }),
    resetScroll: false,
    hashScrollIntoView: false,
  });
  const galleryKey = router.history.location.state.__TSR_key;
  assert.ok(galleryKey);
  assert.equal(new Set([catalogKey, previewKey, galleryKey]).size, 3);
  assert.equal(reads, before, "expanding the gallery must not request the catalog");
  assert.deepEqual(router.latestLocation.search, appliedSearch);
  assert.equal(router.latestLocation.hash, `galeria-${publicId}`);

  // Memory history has no browser adapter. Loading after each real history move
  // exercises Router reconciliation; focus and physical scroll remain browser QA.
  router.history.back();
  await router.load();
  assert.equal(router.history.location.state.__TSR_key, previewKey);
  assert.equal(router.history.location.state.cordialSurfaceKey, openingKey);
  assert.equal(router.latestLocation.hash, `previa-${publicId}`);
  assert.equal(reads, before);
  router.history.back();
  await router.load();
  assert.equal(router.history.location.href, catalogLocation.href);
  assert.equal(router.history.location.state.__TSR_key, catalogKey);
  assert.equal(router.history.location.state.cordialSurfaceKey, undefined);
  assert.equal(router.latestLocation.hash, "");
  assert.deepEqual(router.latestLocation.search, appliedSearch);
  assert.equal(reads, before, "closing the preview by Back must retain the same catalog");
  await router.navigate({
    to: "/buscar",
    search: {
      ...searchSchema.parse({ cidade: "Santa Rosa" }),
      bairro: "Centro",
      visualizacao: "lista",
    },
  });
  assert.equal(reads, before + 1);
  await router.invalidate();
  assert.equal(reads, before + 2, "availability invalidation must continue reading the catalog");
});

test("count keys use the same commercial criteria and ignore ordering and pagination", () => {
  const base = searchSchema.parse({
    referencia: "471",
    finalidade: "venda",
    areaTipo: "util",
    financiamento: "nao",
  });
  assert.equal(
    searchQueryKey(base, true),
    searchQueryKey({ ...base, pagina: 3, ordem: "preco_desc", visualizacao: "lista" }, true),
  );
  assert.notEqual(
    searchQueryKey(base, true),
    searchQueryKey({ ...base, areaTipo: "terreno" }, true),
  );
  assert.notEqual(
    searchQueryKey(base, true),
    searchQueryKey({ ...base, financiamento: undefined }, true),
  );
});

test("draft edits preserve applied filters, zero, exact comparisons and reset an incompatible region", () => {
  const applied = searchSchema.parse({
    cidade: "Santa Rosa",
    bairro: "Centro",
    precoMin: 0,
    dormitorios: 0,
    contagem: "exata",
  });
  const draft = searchDraft(applied);
  const changed = updateSearchDraft(draft, "cidade", "Santo Cristo");
  assert.equal(applied.cidade, "Santa Rosa");
  assert.equal(draft.bairro, "Centro");
  assert.equal(changed.bairro, "");
  assert.equal(changed.precoMin, "0");
  assert.equal(searchSchema.parse(changed).contagem, "exata");
  assert.deepEqual(searchSchema.parse(searchDraft(applied)), applied);
});

test("discarding a draft reconstructs applied URL state including presentation", () => {
  const applied = searchSchema.parse({
    cidade: "Santa Rosa",
    bairro: "Centro",
    visualizacao: "lista",
    pagina: 2,
  });
  const changed = updateSearchDraft(searchDraft(applied), "bairro", "Central");
  assert.equal(changed.bairro, "Central");
  assert.equal(searchSchema.parse(searchDraft(applied)).bairro, "Centro");
  assert.equal(searchSchema.parse(searchDraft(applied)).visualizacao, "lista");
});

test("late responses cannot replace the current request even when cancellation is unsupported upstream", async () => {
  const requests = latestRequest();
  let resolveOld!: (value: number) => void;
  let resolveNew!: (value: number) => void;
  let shown: number | undefined;
  const old = requests.next();
  const oldTask = new Promise<number>((resolve) => {
    resolveOld = resolve;
  }).then((value) => {
    if (requests.current(old)) shown = value;
  });
  const current = requests.next();
  const newTask = new Promise<number>((resolve) => {
    resolveNew = resolve;
  }).then((value) => {
    if (requests.current(current)) shown = value;
  });
  resolveNew(5);
  await newTask;
  resolveOld(0);
  await oldTask;
  assert.equal(shown, 5);
  requests.invalidate();
  assert.equal(requests.current(current), false);
});

test("accent-insensitive lookup preserves official labels and distinct region identities", () => {
  assert.equal(foldSearchText("  Timbáuva  "), "timbauva");
  assert.notEqual(foldSearchText("Centro"), foldSearchText("Central"));
  assert.notEqual(foldSearchText("Figueira"), foldSearchText("Bairro Figueira"));
});
