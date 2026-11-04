import { createFileRoute } from "@tanstack/react-router";
import { loadHome as loadSharedHome } from "@/lib/cordial-site/home-loader";
import type { SiteBootstrap } from "@/lib/cordial-site/contract";
import { HomePage, type HomeData } from "@/components/cordial-site/HomePage";

const loadHome = (settings: SiteBootstrap["settings"] | undefined, signal: AbortSignal) =>
  loadSharedHome(settings, signal, "cordial");

// Último resultado válido (só no navegador): uma recarga que falhe ou volte sem
// imóvel principal nunca troca a foto de abertura por um fundo branco.
let lastHome: HomeData | null = null;

export const Route = createFileRoute("/site/")({
  staleTime: 5 * 60_000,
  loader: async ({ abortController, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    const settings = (parent?.loaderData as SiteBootstrap | undefined)?.settings;
    const isBrowser = typeof window !== "undefined";
    const fresh = loadHome(settings, abortController.signal)
      .then((data) => {
        if (isBrowser && lastHome?.hero && !data.hero) return lastHome;
        if (isBrowser) lastHome = data;
        return data;
      })
      .catch(() => (isBrowser ? lastHome : null));
    if (isBrowser && lastHome) {
      const cached = lastHome;
      void fresh;
      return { home: Promise.resolve(cached) };
    }
    return { home: fresh };
  },
  component: function SiteRoute() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
