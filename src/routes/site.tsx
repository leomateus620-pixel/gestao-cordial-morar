import { createFileRoute } from "@tanstack/react-router";
import { loadBootstrap } from "@/lib/cordial-site/data";
import { siteHead } from "@/lib/cordial-site/seo";
import {
  SiteShell,
  SiteError,
  SitePending,
  SiteNotFound,
} from "@/components/cordial-site/SiteShell";
import siteCss from "@/components/cordial-site/site.css?url";
export const Route = createFileRoute("/site")({
  loader: ({ abortController }) => loadBootstrap(abortController.signal),
  head: ({ loaderData }) => {
    const head = siteHead(
      "Sentir-se em casa!",
      "Encontre imóveis para comprar ou alugar com a Cordial.",
      loaderData,
    );
    return {
      ...head,
      links: [
        ...head.links,
        { rel: "stylesheet", href: siteCss },
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
  component: function SiteRoute() {
    return <SiteShell data={Route.useLoaderData()} />;
  },
  errorComponent: ({ reset }) => (
    <div className="cordial-site">
      <SiteError reset={reset} />
    </div>
  ),
  pendingComponent: SitePending,
  staleTime: 0,
  headers: ({ loaderData }) => ({
    "Cache-Control": "no-store",
    ...(!loaderData?.indexable ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  }),
  notFoundComponent: SiteNotFound,
});
