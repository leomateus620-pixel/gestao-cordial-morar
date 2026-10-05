import { createFileRoute } from "@tanstack/react-router";
import { loadBootstrap, loadCatalog, loadDetail } from "@/lib/cordial-site/morar-data";
import { MorarHomePage } from "@/components/cordial-site/MorarHomePage";

export const Route = createFileRoute("/site-morar/")({
  loader: async ({ abortController }) => {
    const signal = abortController.signal;
    const [bootstrap, featured, rentals] = await Promise.allSettled([
      loadBootstrap(signal),
      loadCatalog({ destaque: "sim" }, signal),
      loadCatalog({ finalidade: "aluguel", tipo: "Casa" }, signal),
    ]);
    const selection = featured.status === "fulfilled" ? featured.value : null;
    let hero = selection?.items.find((p) => p.cover) ?? null;
    if (bootstrap.status === "fulfilled" && bootstrap.value.settings.heroPropertyId) {
      try {
        const chosen = await loadDetail(bootstrap.value.settings.heroPropertyId, signal);
        if (chosen?.cover) hero = chosen;
      } catch {
        /* An unavailable editorial photo never blocks the public home. */
      }
    }
    return {
      featured: selection,
      rentals: rentals.status === "fulfilled" ? rentals.value : null,
      hero,
    };
  },
  component: function MorarHome() {
    return <MorarHomePage {...Route.useLoaderData()} />;
  },
});
