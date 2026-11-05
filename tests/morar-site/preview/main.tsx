import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { HomePage } from "../../../src/components/cordial-site/HomePage";
import { ResultsPage } from "../../../src/components/cordial-site/ResultsPage";
import { DetailPage } from "../../../src/components/cordial-site/DetailPage";
import {
  ContactPage,
  DistrictsPage,
  EditorialPage,
  FavoritesPage,
  NewsPage,
} from "../../../src/components/cordial-site/ContentPages";
import { SiteShell, SiteError, SiteNotFound } from "../../../src/components/cordial-site/SiteShell";
import { searchSchema, searchParams } from "../../../src/lib/cordial-site/contract";
import {
  loadBootstrap,
  loadCatalog,
  loadDetail,
  loadPage,
  loadPages,
} from "../../../src/lib/cordial-site/data";
import { loadHome } from "../../../src/lib/cordial-site/home-loader";
import type { SiteBrand } from "../../../src/lib/cordial-site/brand";
import "../../../src/components/cordial-site/site.css";
import "../../../src/components/cordial-site/morar.css";

// Test-only media simulation when the host OS forces reduced transparency.
// The default preview and production always respect the actual accessibility preference.
if (new URLSearchParams(location.search).get("qa-glass") === "normal") {
  const material = document.createElement("style");
  material.textContent = `
    .morar-site .ms-search.is-compact { background: var(--ms-glass) !important; backdrop-filter: blur(18px) !important; -webkit-backdrop-filter: blur(18px) !important; }
    .morar-site .cs-hx-hero .cs-hx-hero-card { background: rgba(240,243,246,.94) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; }
  `;
  document.head.append(material);
}

// Reuses production components, schema, home selection and API loaders. No seeded catalog.
const root = createRootRoute({
  component: Outlet,
  errorComponent: SiteError,
  notFoundComponent: SiteNotFound,
});
function publicRoutes(brand: SiteBrand) {
  const base = brand === "morar" ? "/site-morar" : "/site";
  const site = createRoute({
    getParentRoute: () => root,
    path: base,
    loader: ({ abortController }) => loadBootstrap(abortController.signal, brand),
    component: () => <SiteShell brand={brand} data={site.useLoaderData()} />,
  });
  const home = createRoute({
    getParentRoute: () => site,
    path: "/",
    loader: async ({ abortController, parentMatchPromise }) => ({
      home: loadHome(
        (await parentMatchPromise).loaderData?.settings,
        abortController.signal,
        brand,
      ),
    }),
    component: () => <HomePage {...home.useLoaderData()} />,
  });
  const results = createRoute({
    getParentRoute: () => site,
    path: "/buscar",
    validateSearch: (input) => searchSchema.parse(input),
    loaderDeps: ({ search }) => search,
    loader: ({ deps, abortController }) => loadCatalog(deps, abortController.signal, brand),
    component: () => (
      <ResultsPage
        key={searchParams(results.useSearch())}
        search={results.useSearch()}
        result={results.useLoaderData()}
      />
    ),
  });
  const detail = createRoute({
    getParentRoute: () => site,
    path: "/imovel/$publicId",
    loader: ({ params, abortController }) =>
      loadDetail(params.publicId, abortController.signal, brand),
    component: () => {
      const property = detail.useLoaderData();
      return property ? <DetailPage property={property} related={null} /> : <SiteNotFound />;
    },
  });
  const contact = createRoute({
    getParentRoute: () => site,
    path: "/contato",
    component: () => <ContactPage />,
  });
  const capture = createRoute({
    getParentRoute: () => site,
    path: "/anuncie",
    component: () => <ContactPage capture />,
  });
  const districts = createRoute({
    getParentRoute: () => site,
    path: "/bairros",
    loader: () => loadPages("district", undefined, brand),
    component: () => <DistrictsPage pages={districts.useLoaderData()} />,
  });
  const favorites = createRoute({
    getParentRoute: () => site,
    path: "/favoritos",
    component: FavoritesPage,
  });
  const news = createRoute({
    getParentRoute: () => site,
    path: "/noticias",
    loader: () => loadPages("news", undefined, brand),
    component: () => <NewsPage pages={news.useLoaderData()} />,
  });
  const editorial = createRoute({
    getParentRoute: () => site,
    path: "/$page",
    loader: ({ params }) => loadPage(params.page, undefined, brand),
    component: () => (
      <EditorialPage slug={editorial.useParams().page} content={editorial.useLoaderData()} />
    ),
  });
  return site.addChildren([
    home,
    results,
    detail,
    contact,
    capture,
    districts,
    favorites,
    news,
    editorial,
  ]);
}
const router = createRouter({
  routeTree: root.addChildren([publicRoutes("morar"), publicRoutes("cordial")]),
  scrollRestoration: true,
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
