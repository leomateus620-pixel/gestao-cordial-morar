/* eslint-disable react-refresh/only-export-components -- Isolated visual verification. */
import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  Outlet,
  RouterProvider,
  Link,
} from "@tanstack/react-router";
import { DashboardMetricCards } from "@/components/dashboard/DashboardMetricCards";
import "@/styles.css";
import "./preview.css";
const params = new URLSearchParams(location.search);
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
function Shell() {
  return (
    <main
      className="preview-main"
      style={params.get("width") ? { maxWidth: Number(params.get("width")) } : undefined}
    >
      <div className="preview-notice">PRÉVIA DE DESIGN · Dados fictícios · 15 nov. 2026</div>
      <header className="preview-hero">
        <p>PAINEL GESTÃO CORDIAL</p>
        <h1>Visão geral</h1>
        <span>Acompanhe seus atendimentos e explore cada período.</span>
      </header>
      <Outlet />
      <p className="preview-footnote">
        Selecione o ícone de um indicador para personalizar o período. As barras mostram a
        distribuição dos registros.
      </p>
    </main>
  );
}
const root = createRootRoute({ component: Shell });
const index = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: DashboardMetricCards,
});
const attendance = createRoute({
  getParentRoute: () => root,
  path: "/atendimentos",
  component: () => (
    <div>
      Destino: Atendimentos. <Link to="/">Voltar ao painel</Link>
    </div>
  ),
});
const agenda = createRoute({
  getParentRoute: () => root,
  path: "/agenda",
  component: () => (
    <div>
      Destino: Agenda. <Link to="/">Voltar ao painel</Link>
    </div>
  ),
});
const router = createRouter({
  routeTree: root.addChildren([index, attendance, agenda]),
  history: createHashHistory(),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
