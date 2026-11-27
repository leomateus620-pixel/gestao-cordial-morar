import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { SiteAudienceDashboard } from "@/components/dashboard/SiteAudienceDashboard";
import { createAudienceFixture } from "./audience-fixture";
import "@/styles.css";
import "./preview.css";

const params = new URLSearchParams(location.search);
const brand = params.get("brand") === "morar" ? "morar" : "cordial";
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");

const query = new QueryClient();
const fixtureCover = new URL("./audience-fixture-house.jpg", import.meta.url).href;
const loadReport = createAudienceFixture(params.get("state"), {
  cordial: fixtureCover,
  morar: fixtureCover,
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={query}>
      <main className="preview-main" style={{ maxWidth: 1190 }}>
        <div className="preview-notice">PRÉVIA DE DESIGN · Dados fictícios · 26 nov. 2026</div>
        <SiteAudienceDashboard
          scope="synthetic-preview"
          loadReport={loadReport}
          initialBrand={brand}
        />
      </main>
    </QueryClientProvider>
  </React.StrictMode>,
);
