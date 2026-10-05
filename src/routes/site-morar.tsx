import { createFileRoute } from "@tanstack/react-router";
import { loadBootstrap } from "@/lib/cordial-site/morar-data";
import { siteHead } from "@/lib/cordial-site/morar-seo";
import { SiteBrandContext } from "@/lib/cordial-site/context";
import {
  SiteShell,
  SiteError,
  SitePending,
  SiteNotFound,
} from "@/components/cordial-site/SiteShell";
import sharedCss from "@/components/cordial-site/site.css?url";
import morarCss from "@/components/cordial-site/morar.css?url";

export const Route = createFileRoute("/site-morar")({
  loader: ({ abortController }) => loadBootstrap(abortController.signal),
  head: ({ loaderData }) => {
    const head = siteHead(
      "Seu próximo lar, mais perto de você",
      "Encontre imóveis para comprar ou alugar com a Morar Imóveis.",
      loaderData,
    );
    return {
      ...head,
      links: [
        ...head.links,
        { rel: "stylesheet", href: sharedCss },
        { rel: "stylesheet", href: morarCss },
        {
          rel: "preload",
          href: "/cordial-site/manrope-latin-variable.woff2",
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous" as const,
        },
      ],
    };
  },
  component: function MorarRoute() {
    return <SiteShell data={Route.useLoaderData()} brand="morar" />;
  },
  errorComponent: ({ reset }) => (
    <SiteBrandContext.Provider value="morar">
      <div className="cordial-site morar-site">
        <SiteError reset={reset} />
      </div>
    </SiteBrandContext.Provider>
  ),
  pendingComponent: () => (
    <div className="cordial-site morar-site">
      <SitePending />
    </div>
  ),
  notFoundComponent: () => (
    <SiteBrandContext.Provider value="morar">
      <div className="cordial-site morar-site">
        <SiteNotFound />
      </div>
    </SiteBrandContext.Provider>
  ),
  staleTime: 0,
  headers: ({ loaderData }) => ({
    "Cache-Control": "no-store",
    ...(!loaderData?.indexable ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  }),
});
