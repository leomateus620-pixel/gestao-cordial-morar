import { createFileRoute } from "@tanstack/react-router";
import { homeHead, siteMatchData } from "@/lib/cordial-site/seo";
import type { SiteBootstrap } from "@/lib/cordial-site/contract";
import { HomePage } from "@/components/cordial-site/HomePage";
import { loadHome } from "@/lib/cordial-site/home-loader";

export const Route = createFileRoute("/site-morar/")({
  staleTime: 5 * 60_000,
  head: ({ matches }) => homeHead(siteMatchData(matches, "morar"), "morar"),
  loader: ({ abortController, parentMatchPromise }) =>
    loadHome(
      parentMatchPromise.then(
        (parent) => (parent?.loaderData as SiteBootstrap | undefined)?.settings,
      ),
      abortController.signal,
      "morar",
    ),
  component: function MorarHome() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
