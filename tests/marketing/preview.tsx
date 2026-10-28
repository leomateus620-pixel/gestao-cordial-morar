/* eslint-disable react-refresh/only-export-components -- Standalone preview entry. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { MetaAdsCard } from "../../src/components/integracoes/MetaAdsCard";
import { useMarketing } from "../../src/hooks/useMarketing";
import { useApp } from "../../src/store/app-store";
import { marketingSearchSchema, marketingQueryRanges } from "../../src/lib/marketing/query-state";
import { MarketingDashboard } from "../../src/components/marketing/MarketingDashboard";
import "../../src/styles.css";
const params = new URLSearchParams(location.search);
function Preview() {
  const [filters, setFilters] = useState(() =>
    marketingSearchSchema.parse(Object.fromEntries(params)),
  );
  const ranges = marketingQueryRanges(filters),
    agency = useApp((s) => s.agency);
  const data = useMarketing({
    since: ranges.previous.since,
    until: ranges.current.until,
    currentSince: ranges.current.since,
    previousUntil: ranges.previous.until,
    imobiliaria: filters.agency && filters.agency !== "todas" ? filters.agency : null,
    page: filters.page,
    search: filters.search,
    platform: filters.platform || null,
    status: filters.status || null,
    accountId: filters.accountId || null,
  });
  return (
    <main className="mx-auto max-w-[1440px] p-3 sm:p-6">
      <aside className="mb-4 rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-950">
        PRÉVIA ISOLADA · Dados sintéticos · Nenhuma conexão real com Meta ou CRM · Perfil{" "}
        {params.get("role") ?? "administrador"}
      </aside>
      {params.get("surface") === "integrations" ? (
        <MetaAdsCard />
      ) : (
        <MarketingDashboard
          campaigns={data.campaigns}
          ranges={ranges}
          agency={filters.agency ?? agency}
          summary={data.summary}
          total={data.total}
          query={filters}
          onQueryChange={(next) => {
            setFilters(next);
            const url = new URL(window.location.href);
            for (const [key, value] of Object.entries(next)) {
              if (value !== undefined) url.searchParams.set(key, String(value));
            }
            window.history.replaceState({}, "", url);
          }}
          isLoading={data.isLoading}
          isError={data.isError}
          canViewFinancialInsights={
            !["secretaria", "bianca", "meta_reviewer"].includes(params.get("role") ?? "")
          }
        />
      )}
      <Toaster />
    </main>
  );
}
const root = createRootRoute();
const route = createRoute({ getParentRoute: () => root, path: "/", component: Preview });
const router = createRouter({
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={query}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
