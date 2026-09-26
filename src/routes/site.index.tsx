import { createFileRoute } from "@tanstack/react-router";
import { loadCatalog } from "@/lib/cordial-site/data";
import { HomePage } from "@/components/cordial-site/HomePage";
export const Route = createFileRoute("/site/")({
  loader: async ({ abortController }) => {
    const [featured, recent] = await Promise.allSettled([
      loadCatalog({ destaque: "sim" }, abortController.signal),
      loadCatalog({}, abortController.signal),
    ]);
    return {
      featured: featured.status === "fulfilled" ? featured.value : null,
      recent: recent.status === "fulfilled" ? recent.value : null,
    };
  },
  component: function SiteRoute() {
    return <HomePage {...Route.useLoaderData()} />;
  },
});
