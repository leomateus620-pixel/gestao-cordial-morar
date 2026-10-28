/* eslint-disable react-refresh/only-export-components -- Standalone preview entry. */
import React, { useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Home,
  Menu,
  Users,
} from "lucide-react";
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
import {
  marketingSearchSchema,
  marketingQueryRanges,
  type MarketingDashboardQuery,
} from "../../src/lib/marketing/query-state";
import { MarketingDashboard } from "../../src/components/marketing/MarketingDashboard";
import {
  MarketingHeaderSearchInput,
  MarketingHeaderAgencyControl,
} from "../../src/components/marketing/MarketingHeaderControls";
import "../../src/styles.css";
const params = new URLSearchParams(location.search);
function Preview() {
  const [filters, setFilters] = useState(() =>
    marketingSearchSchema.parse(Object.fromEntries(params)),
  );
  const ranges = marketingQueryRanges(filters, new Date("2026-10-28T15:00:00Z")),
    globalAgency = useApp((s) => s.agency),
    agency = filters.agency ?? globalAgency;
  function updateFilters(next: typeof filters) {
    setFilters(next);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    window.history.replaceState({}, "", url);
  }
  const data = useMarketing({
    since: ranges.previous.since,
    until: ranges.current.until,
    currentSince: ranges.current.since,
    previousUntil: ranges.previous.until,
    imobiliaria: agency !== "todas" ? agency : null,
    page: filters.page,
    search: filters.search,
    platform: filters.platform || null,
    status: filters.status || null,
    accountId: filters.accountId || null,
  });
  return (
    <PreviewFrame query={filters} onQueryChange={updateFilters}>
      <aside
        data-preview-notice
        className="mb-3 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950"
      >
        PRÉVIA ISOLADA · Dados sintéticos · Nenhuma conexão real com Meta ou CRM · Perfil{" "}
        {params.get("role") ?? "administrador"}
      </aside>
      {params.get("surface") === "integrations" ? (
        <MetaAdsCard />
      ) : (
        <MarketingDashboard
          campaigns={data.campaigns}
          ranges={ranges}
          agency={agency}
          summary={data.summary}
          total={data.total}
          query={filters}
          onQueryChange={updateFilters}
          isLoading={data.isLoading}
          isError={data.isError}
          isRefreshing={data.isRefreshing}
          canViewFinancialInsights={
            !["secretaria", "bianca", "meta_reviewer"].includes(params.get("role") ?? "")
          }
        />
      )}
      <Toaster />
    </PreviewFrame>
  );
}
/** Shell geometry only: real Marketing components, synthetic session/transport, no global requests. */
function PreviewFrame({
  children,
  query,
  onQueryChange,
}: {
  children: React.ReactNode;
  query: MarketingDashboardQuery;
  onQueryChange: (next: MarketingDashboardQuery) => void;
}) {
  const [collapsed, setCollapsed] = useState(params.get("sidebar") === "closed");
  if (params.get("shell") !== "1")
    return (
      <main className="mx-auto max-w-[1440px] p-3 sm:p-6">
        {params.get("surface") !== "integrations" && (
          <header
            className="mb-3 flex flex-wrap items-center gap-3"
            aria-label="Contexto global da prévia"
          >
            <MarketingHeaderSearchInput
              query={query}
              onQueryChange={onQueryChange}
              className="w-full sm:max-w-[22rem]"
            />
            <MarketingHeaderAgencyControl
              query={query}
              onQueryChange={onQueryChange}
              className="ml-auto max-w-60"
            />
          </header>
        )}
        {children}
      </main>
    );
  return (
    <div
      className="app-shell-root relative min-h-dvh w-full font-sans text-foreground"
      data-sidebar-ready="true"
      data-sidebar-state={collapsed ? "collapsed" : "expanded"}
    >
      <aside
        className="app-sidebar-shell sidebar-glass fixed z-40 hidden flex-col lg:flex"
        aria-label="Navegação sintética da prévia"
      >
        <div className="app-sidebar-header" data-collapsed={String(collapsed)}>
          <Building2 className="m-2 size-7 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="text-sm font-semibold">Gestão Cordial</span>}
          <button
            type="button"
            className="app-sidebar-toggle"
            aria-label={collapsed ? "Expandir sidebar da prévia" : "Recolher sidebar da prévia"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
        <div className="mt-6 space-y-2 px-1">
          {[
            [Home, "Painel"],
            [Building2, "Imóveis"],
            [Users, "Atendimentos"],
            [CalendarDays, "Agenda"],
            [BarChart3, "Marketing"],
          ].map(([Icon, label]) => {
            const ItemIcon = Icon as typeof Home;
            return (
              <div
                key={String(label)}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm ${label === "Marketing" ? "bg-[var(--app-sidebar-active-surface)] font-semibold ring-1 ring-[var(--app-sidebar-active-border)]" : "text-[var(--app-sidebar-secondary-text)]"}`}
                aria-current={label === "Marketing" ? "page" : undefined}
              >
                <ItemIcon className="size-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{String(label)}</span>}
              </div>
            );
          })}
        </div>
        <p className="app-sidebar-footer mt-auto">
          {collapsed ? "QA" : "Shell sintético para validação"}
        </p>
      </aside>
      <div className="app-shell-content relative min-h-dvh w-full">
        <header className="px-4 py-2.5 lg:px-6" aria-label="Contexto global da prévia">
          <div className="glass-panel-strong mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 rounded-2xl border border-white/50 px-4 py-2 lg:rounded-full">
            <Menu className="size-5 text-primary lg:hidden" aria-hidden="true" />
            <span className="shrink-0 text-sm font-semibold text-foreground/70">
              Olá, Pessoa de teste
            </span>
            <MarketingHeaderSearchInput
              query={query}
              onQueryChange={onQueryChange}
              className="order-last w-full min-w-0 lg:order-none lg:max-w-[22rem] lg:flex-1"
            />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <MarketingHeaderAgencyControl query={query} onQueryChange={onQueryChange} />
              <Bell className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden="true" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/65 text-xs font-bold text-primary">
                PT
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-screen-2xl px-4 pb-10 lg:px-8 lg:pt-2 xl:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
const root = createRootRoute();
const route = createRoute({ getParentRoute: () => root, path: "/", component: Preview });
const router = createRouter({
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const previewRoot = createRoot(document.getElementById("root")!);
previewRoot.render(
  <QueryClientProvider client={query}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

if (import.meta.hot) import.meta.hot.dispose(() => previewRoot.unmount());
