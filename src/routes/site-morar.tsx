import { createFileRoute } from "@tanstack/react-router";
import { loadBootstrap } from "@/lib/cordial-site/morar-data";
import { agentJsonLd, homeHead, siteLayoutHead } from "@/lib/cordial-site/morar-seo";
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
    // Layout keeps a fallback title/description but no canonical/og:url/og:image (pages own them).
    const base = homeHead(loaderData);
    const layout = siteLayoutHead(loaderData);
    const head = {
      meta: [
        ...base.meta.filter(
          (m) =>
            !("property" in m && ["og:url", "og:image", "og:image:alt", "og:image:width", "og:image:height"].includes(String(m.property))) &&
            !("name" in m && m.name === "twitter:image"),
        ),
        ...layout.meta,
      ],
      links: layout.links,
    };
    const agent = agentJsonLd(loaderData);
    return {
      meta: head.meta,
      scripts: agent
        ? [{ type: "application/ld+json", children: JSON.stringify(agent).replace(/</g, "\\u003c") }]
        : [],
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
