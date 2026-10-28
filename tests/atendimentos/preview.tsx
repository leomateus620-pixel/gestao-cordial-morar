/* eslint-disable react-refresh/only-export-components -- Standalone development preview. */
import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Building2, Users, Home, CalendarDays, LayoutDashboard, RefreshCw } from "lucide-react";
import { Route as AttendanceRoute } from "../../src/routes/_app.atendimentos";
import { fixtureMetrics, failNextList } from "./transport-fixture";
import "./preview.css";

const params = new URLSearchParams(location.search);
if (!location.hash) {
  const initial =
    params.get("initial") === "list"
      ? "modo=lista"
      : "modo=etapa&etapa=primeiro_contato&origem=funil";
  history.replaceState(
    {},
    "",
    `${location.pathname}${location.search}#/atendimentos?track=venda&${initial}`,
  );
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const subscribe = (listener: () => void) => {
  window.addEventListener("attendance-fixture-change", listener);
  return () => window.removeEventListener("attendance-fixture-change", listener);
};
const getSnapshot = () => JSON.stringify(fixtureMetrics);

function Diagnostics() {
  const metrics = JSON.parse(useSyncExternalStore(subscribe, getSnapshot)) as typeof fixtureMetrics;
  return (
    <aside
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950"
      aria-label="Diagnóstico da prévia"
    >
      <div>
        <p className="font-semibold">PRÉVIA ISOLADA · Dados fictícios · Sem conexão com produção</p>
        <p className="mt-1">
          Listagens: {metrics.lists} · Históricos: {metrics.histories} · Primeiras aberturas:{" "}
          {metrics.firstOpens} · Alterações: {metrics.mutations}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-9 rounded-lg border border-amber-900/20 px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() =>
            document
              .querySelector('[aria-label="Resumo do funil"]')
              ?.scrollIntoView({ block: "start", behavior: "instant" })
          }
        >
          Ver etapas
        </button>
        <button
          type="button"
          className="min-h-9 rounded-lg border border-amber-900/20 px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => window.history.back()}
        >
          Voltar no navegador
        </button>
        <button
          type="button"
          className="min-h-9 rounded-lg border border-amber-900/20 px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => window.history.forward()}
        >
          Avançar no navegador
        </button>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-900/20 px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => {
            failNextList();
            void queryClient.invalidateQueries({ queryKey: ["attendances"] });
          }}
        >
          <RefreshCw className="size-3.5" /> Simular falha de atualização
        </button>
      </div>
    </aside>
  );
}

function Shell() {
  return (
    <div className="min-h-screen bg-background">
      {params.get("sidebar") !== "hidden" && (
        <aside
          className="fixed inset-y-0 left-0 hidden w-[272px] border-r border-border bg-white/80 p-5 lg:block"
          aria-label="Contexto de navegação da prévia"
        >
          <div className="mb-9 flex items-center gap-3 text-teal-900">
            <Building2 className="size-8" />
            <div>
              <p className="font-semibold">Gestão Cordial</p>
              <p className="text-xs text-muted-foreground">Ambiente de desenvolvimento</p>
            </div>
          </div>
          <nav aria-label="Navegação ilustrativa" className="space-y-2 text-sm">
            {[
              { label: "Visão geral", icon: LayoutDashboard },
              { label: "Atendimentos", icon: Users },
              { label: "Imóveis", icon: Home },
              { label: "Agenda", icon: CalendarDays },
            ].map(({ label, icon: Icon }) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-xl p-3 ${label === "Atendimentos" ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="size-4" />
                {label}
              </div>
            ))}
          </nav>
          <p className="absolute bottom-6 left-5 right-5 text-xs text-muted-foreground">
            A barra lateral representa a largura útil; o conteúdo e a ficha usam os componentes
            reais.
          </p>
        </aside>
      )}
      <main
        className={`min-w-0 p-3 sm:p-6 ${params.get("sidebar") === "hidden" ? "" : "lg:ml-[272px]"}`}
      >
        <Diagnostics />
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}

const root = createRootRoute({ component: Shell });
const appRoute = createRoute({ getParentRoute: () => root, id: "_app" });
// Same route id, component and validateSearch as routeTree.gen; only the shell
// and transports are substituted by this development entry point.
const attendanceRoute = AttendanceRoute.update({
  id: "/atendimentos",
  path: "/atendimentos",
  getParentRoute: () => appRoute,
} as never);
const router = createRouter({
  routeTree: root.addChildren([appRoute.addChildren([attendanceRoute])]),
  history: createHashHistory(),
  scrollRestoration: true,
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
