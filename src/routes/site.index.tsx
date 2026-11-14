import { createFileRoute } from "@tanstack/react-router";
import { loadHome } from "@/lib/cordial-site/home-loader";
import { homeHead, siteMatchData } from "@/lib/cordial-site/seo";
import type { SiteBootstrap } from "@/lib/cordial-site/contract";
import { HomePage } from "@/components/cordial-site/HomePage";

export const Route = createFileRoute("/site/")({
  staleTime: 5 * 60_000,
  head: ({ matches }) => homeHead(siteMatchData(matches, "cordial"), "cordial"),
  loader: ({ abortController, parentMatchPromise }) =>
    loadHome(
      parentMatchPromise.then(
        (parent) => (parent?.loaderData as SiteBootstrap | undefined)?.settings,
      ),
      abortController.signal,
      "cordial",
    ),
  component: function SiteRoute() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
