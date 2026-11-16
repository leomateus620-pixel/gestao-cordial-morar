import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PublicBotInsightsView } from "@/components/dashboard/PublicBotInsightsView";
import type { InsightDays } from "@/lib/public-bot-insights/contracts";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import { detailFixture, listFixture, overviewFixture, conversationFixture } from "./ui-fixtures";
import "@/styles.css";
import "./preview.css";

function Preview() {
  const params = new URLSearchParams(location.search);
  const [state, setState] = useState(params.get("state") ?? "ready");
  const [days, setDays] = useState<InsightDays>(7);
  const [brand, setBrand] = useState<BotBrand | null>(null);
  const [page, setPage] = useState(1);
  const [id, setId] = useState<string | null>(null);
  const [dark, setDark] = useState(params.get("theme") === "dark");
  document.documentElement.classList.toggle("dark", dark);
  const overview = overviewFixture(days);
  const list = listFixture(brand ?? "cordial", page);
  const detail = detailFixture(
    list.items.find((item) => item.id === id) ?? conversationFixture(brand ?? "cordial"),
  );
  if (state === "empty") {
    overview.brands = overview.brands.map((item) => ({
      ...item,
      opens: 0,
      sessions: 0,
      conversations: 0,
      messages: 0,
      whatsapp: 0,
      daily: item.daily.map((day) => ({
        ...day,
        opens: 0,
        sessions: 0,
        conversations: 0,
        messages: 0,
        whatsapp: 0,
      })),
    }));
    list.items = [];
    list.total = 0;
  }
  if (params.has("truncated")) {
    detail.evolutionTotal = 734;
    detail.evolutionTruncated = true;
  }
  const status = {
    isLoading: state === "loading",
    isError: state === "error",
    refetch: () => setState("ready"),
  };
  return (
    <main className="insights-preview">
      <aside className="insights-preview-notice">
        <strong>Prévia de desenvolvimento · Dados sintéticos</strong>
        <label>
          Estado{" "}
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="ready">Com atividade</option>
            <option value="empty">Sem atividade</option>
            <option value="loading">Carregando</option>
            <option value="error">Indisponível</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(event) => setDark(event.target.checked)}
          />{" "}
          Tema escuro
        </label>
      </aside>
      <header className="insights-preview-heading">
        <p>Painel Gestão Cordial</p>
        <h1>Visão geral</h1>
        <p>Seção administrativa de acompanhamento dos bots.</p>
      </header>
      <PublicBotInsightsView
        days={days}
        onDaysChange={(value) => {
          setDays(value);
          setPage(1);
          setId(null);
        }}
        brand={brand}
        onBrandChange={(value) => {
          setBrand(value);
          setPage(1);
          setId(null);
        }}
        page={page}
        onPageChange={setPage}
        conversationId={id}
        onConversationChange={setId}
        overview={{ ...status, data: state === "loading" ? undefined : overview }}
        conversations={{ ...status, data: state === "loading" ? undefined : list }}
        detail={{ ...status, data: state === "loading" ? undefined : detail }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
