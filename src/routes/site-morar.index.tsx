import { createFileRoute } from "@tanstack/react-router";
import type { SiteBootstrap } from "@/lib/cordial-site/contract";
import { HomePage, type HomeData } from "@/components/cordial-site/HomePage";
import { loadHome } from "@/lib/cordial-site/home-loader";

// Última abertura válida da Morar (só no navegador, separada da Cordial).
// Com ela, uma atualização acontece por trás da tela atual: a foto nunca some
// para o fundo escuro. Retirada confirmada substitui o cache; só falha de rede
// mantém a abertura anterior.
let lastMorarHome: HomeData | null = null;

export const Route = createFileRoute("/site-morar/")({
  staleTime: 5 * 60_000,
  loader: async ({ abortController, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    const settings = (parent?.loaderData as SiteBootstrap | undefined)?.settings;
    const isBrowser = typeof window !== "undefined";
    const fresh = loadHome(settings, abortController.signal, "morar")
      .then((data) => {
        if (isBrowser) lastMorarHome = data;
        return data;
      })
      .catch(() => (isBrowser ? lastMorarHome : null));
    if (isBrowser && lastMorarHome) {
      // Aguarda aqui: a tela anterior continua visível até o resultado novo.
      const data = await fresh;
      return { home: Promise.resolve(data) };
    }
    return { home: fresh };
  },
  component: function MorarHome() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
