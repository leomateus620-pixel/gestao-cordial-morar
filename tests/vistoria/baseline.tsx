// Source copied from c6a53a3d into tmp/ only for before/after captures.
import React from "react";
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
import { VistoriasPage } from "../../tmp/vistoria-baseline/index";
import { NovaVistoria } from "../../tmp/vistoria-baseline/nova";
import { VistoriaPage } from "../../tmp/vistoria-baseline/$vistoriaId";
import "../../src/styles.css";
const state = new URLSearchParams(location.search).get("state");
const Component = state === "new" ? NovaVistoria : state === "room" ? VistoriaPage : VistoriasPage;
const root = createRootRoute();
const route = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => (
    <div className="px-4">
      <Component />
      <Toaster />
    </div>
  ),
});
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
