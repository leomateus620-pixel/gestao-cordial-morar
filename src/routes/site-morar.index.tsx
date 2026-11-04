import { createFileRoute } from "@tanstack/react-router";
import type { SiteBootstrap } from "@/lib/cordial-site/contract";
import { HomePage } from "@/components/cordial-site/HomePage";
import { loadHome } from "@/lib/cordial-site/home-loader";

export const Route = createFileRoute("/site-morar/")({
  staleTime: 60_000,
  loader: async ({ abortController, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    const settings = (parent?.loaderData as SiteBootstrap | undefined)?.settings;
    // No stale fallback: a confirmed withdrawal must disappear from the Morar home.
    return { home: loadHome(settings, abortController.signal, "morar").catch(() => null) };
  },
  component: function MorarHome() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
