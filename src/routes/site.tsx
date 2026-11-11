import { createFileRoute } from "@tanstack/react-router";
import { loadBootstrap } from "@/lib/cordial-site/data";
import { agentJsonLd, homeHead, siteLayoutHead } from "@/lib/cordial-site/seo";
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
    // Layout keeps a fallback title/description but no canonical/og:url/og:image (pages own them).
    const base = homeHead(loaderData, "cordial");
    const layout = siteLayoutHead(loaderData, "cordial");
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
    const agent = agentJsonLd(loaderData, "cordial");
    return {
      meta: head.meta,
      scripts: agent
        ? [{ type: "application/ld+json", children: JSON.stringify(agent).replace(/</g, "\\u003c") }]
        : [],
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
