// PREVIEW ONLY. All listings, replies and transport below are synthetic and clearly identified.
// Production components are reused; no production API or paid AI call is made.
import { createRoot } from "react-dom/client";
import { Mascot, type MascotState } from "../../src/components/public-property-bot/Mascot";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { SiteShell } from "../../src/components/cordial-site/SiteShell";
import { settingsSchema } from "../../src/lib/cordial-site/contract";
import {
  newDraft,
  type BotBrand,
  type BotCard,
  type ChatInput,
  type TurnResult,
} from "../../src/lib/public-property-bot/contracts";
import { reduceDraft } from "../../src/lib/public-property-bot/state";
import "../../src/components/cordial-site/site.css";
import "../../src/components/cordial-site/morar.css";
import "./preview.css";
const params = new URLSearchParams(location.search);
const brand: BotBrand =
  params.get("brand") === "morar" || location.pathname.startsWith("/site-morar")
    ? "morar"
    : "cordial";
const base = brand === "morar" ? "/site-morar" : "/site";
const count = [1, 3, 5].includes(Number(params.get("results"))) ? Number(params.get("results")) : 3;
const scenario = params.get("state") ?? "welcome";
if (!location.pathname.startsWith(base)) history.replaceState({}, "", `${base}?${params}`);
const settings = settingsSchema.parse({
  brand: brand === "morar" ? "Morar Imóveis" : "Cordial Imóveis",
  whatsapp: "5555000000000",
  privacy:
    "Esta é uma prévia local com dados sintéticos para avaliação da interface. Não é um catálogo de imóveis.",
  about: "Prévia sintética",
});
const bootstrap = {
  available: true,
  indexable: false,
  canonicalOrigin: null,
  settings,
  facets: { types: [], cities: [], districts: [], stages: [], total: 0 },
};
let draft = newDraft();
const results = new Map<string, TurnResult>();
const makeCards = (): BotCard[] =>
  Array.from({ length: count }, (_, index) => {
    const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      id,
      version: "a".repeat(32),
      reference: `TESTE-${index + 1}`,
      title:
        index === 0
          ? "Casa com varanda"
          : index === 1
            ? "Casa térrea com jardim"
            : "Casa em condomínio",
      location:
        index === 0
          ? "Centro · Santa Rosa"
          : "Loteamento Residencial Jardim das Araucárias · Cidade de teste",
      price: `R$ ${(550000 + index * 10000).toLocaleString("pt-BR")}`,
      bedrooms: index === 1 ? null : 3,
      bathrooms: 2,
      features: ["Churrasqueira"],
      detailPath: `${base}/imovel/casa-de-teste-${id}`,
      imagePath: `/api/${brand}-site/media/${id}/${"a".repeat(32)}/card`,
      whatsappUrl: "https://wa.me/5555000000000?text=PREVIA%20SINTETICA",
      alternative: scenario === "alternatives" ? ["Piscina privativa: não informada"] : [],
    };
  });
const suggestions = [
  {
    id: "test-house",
    label: "Casas para comprar",
    patch: { operation: "venda" as const, type: "Casa" },
  },
  {
    id: "test-budget",
    label: "Até R$ 650 mil",
    patch: {
      operation: "venda" as const,
      budget: { min: null, max: { value: 650000, inclusive: true } },
    },
  },
  {
    id: "test-district",
    label: "Imóveis no Centro",
    patch: { city: "Santa Rosa", district: "Centro" },
  },
];
if (["results", "quota", "alternatives"].includes(scenario)) {
  draft = {
    ...newDraft(),
    revision: 1,
    countsAnswered: true,
    budgetAnswered: true,
    filters: {
      ...newDraft().filters,
      operation: "venda",
      type: "Casa",
      city: "Santa Rosa",
      district: "Centro",
      bedrooms: { op: "gte", value: 3 },
      bathrooms: { op: "gte", value: 2 },
      budget: { min: null, max: { value: 650000, inclusive: true } },
    },
  };
  results.set("20000000-0000-4000-8000-000000000001", {
    requestId: "20000000-0000-4000-8000-000000000001",
    draft,
    answer: `Encontrei ${count === 1 ? "uma opção" : `${count} opções`} com os filtros da sua busca.`,
    cards: makeCards(),
    question: null,
    exhausted: false,
    unavailable: false,
  });
}
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, options?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, options);
  if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (url.pathname.endsWith("/bootstrap")) return Response.json(bootstrap, { headers });
  if (url.pathname.endsWith("/bot/events")) return Response.json({ accepted: true }, { headers });
  if (url.pathname.endsWith("/bot/session")) {
    if (scenario === "unavailable")
      return Response.json({ code: "service_unavailable" }, { status: 503, headers });
    return Response.json(
      {
        draft,
        turns: [...results.values()].map(({ requestId, answer, cards }) => ({
          requestId,
          answer,
          cards,
        })),
        enabled: true,
        voice: false,
        suggestions,
        contactHref: "https://wa.me/5555000000000?text=PREVIA%20SINTETICA",
      },
      { headers },
    );
  }
  if (url.pathname.endsWith("/bot/chat")) {
    if (scenario === "quota")
      return Response.json(
        { code: "quota_exhausted" },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    if (scenario === "error")
      return Response.json({ code: "provider_unavailable" }, { status: 503, headers });
    const request = JSON.parse(String(options?.body)) as ChatInput;
    if (results.has(request.requestId))
      return Response.json(results.get(request.requestId), { headers });
    if (request.action.kind === "text")
      draft = {
        ...draft,
        revision: draft.revision + 1,
        countsAnswered: true,
        budgetAnswered: true,
        filters: {
          ...draft.filters,
          operation: "venda",
          type: "Casa",
          budget: { min: null, max: { value: 650000, inclusive: true } },
        },
      };
    else if (request.action.kind !== "property_question")
      draft = reduceDraft(draft, request.revision, request.action);
    const question = !draft.filters.operation
      ? { kind: "operation" as const }
      : !draft.countsAnswered
        ? { kind: "counts" as const }
        : !draft.budgetAnswered
          ? { kind: "budget" as const, operation: draft.filters.operation }
          : null;
    const result: TurnResult = {
      requestId: request.requestId,
      draft,
      cards: question || scenario === "empty" ? [] : makeCards(),
      answer:
        question?.kind === "counts"
          ? "Quantos quartos e banheiros você procura?"
          : question?.kind === "budget"
            ? "Até quanto você pretende investir?"
            : question
              ? "Você procura comprar ou alugar?"
              : scenario === "empty"
                ? "Não encontrei opções com todos esses critérios. Quer ajustar algum filtro?"
                : `Encontrei ${count === 1 ? "uma opção" : `${count} opções`}. Quer refinar sua busca?`,
      question,
      exhausted: false,
      unavailable: false,
    };
    results.set(request.requestId, result);
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (type: string, sequence: number, payload = {}) =>
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type, requestId: request.requestId, revision: draft.revision, sequence, ...payload })}\n\n`,
              ),
            );
          send("accepted", 0);
          send("status", 1, { message: "Buscando opções" });
          await new Promise((resolve) => setTimeout(resolve, 500));
          send("results", 2, { result });
          send("done", 3, { result });
          controller.close();
        },
      }),
      { headers: { ...headers, "Content-Type": "text/event-stream" } },
    );
  }
  return Response.json({ code: "preview_only" }, { status: 404, headers });
};
function PreviewContent() {
  return (
    <div className="bot-preview-page">
      <aside>
        <strong>Prévia sintética · não é o catálogo real</strong>
        <p>
          Interface de produção com transporte e imóveis fictícios. Não há IA, telefone real ou
          gravação nesta prévia.
        </p>
        <nav aria-label="Cenários de prévia">
          <a href="/site?brand=cordial">Cordial</a>
          <a href="/site-morar?brand=morar">Morar</a>
          {[1, 3, 5].map((n) => (
            <a key={n} href={`${base}?brand=${brand}&state=results&results=${n}`}>
              {n} resultado{n > 1 ? "s" : ""}
            </a>
          ))}
          {["welcome", "empty", "error", "quota", "unavailable", "alternatives", "mascots"].map((state) => (
            <a key={state} href={`${base}?brand=${brand}&state=${state}`}>
              {state}
            </a>
          ))}
        </nav>
      </aside>
      <section>
        <p>{brand === "morar" ? "Morar Imóveis" : "Cordial Imóveis"}</p>
        <h1>Seu próximo lugar começa com uma boa conversa.</h1>
        <p>
          Abra o bot no cabeçalho para avaliar seleção, resultados e refinamento. O WhatsApp
          continua no seu lugar.
        </p>
      </section>
      {scenario === "mascots" && <div className="bot-preview-mascots" aria-label="Personagens e estados">
        {(["cordial", "morar"] as const).map(mascotBrand => <article key={mascotBrand}>
          <h2>{mascotBrand === "cordial" ? "Cordial Bot" : "Morar Bot"}</h2>
          <div>{(["neutral", "listening", "searching", "complete"] as MascotState[]).map((state, index) => <figure key={state}><Mascot brand={mascotBrand} state={state} size={64} /><figcaption>{["Olá", "Ouvindo", "Buscando", "Concluído"][index]}</figcaption></figure>)}</div>
          <div>{[24, 32, 40, 64].map(size => <figure key={size}><Mascot brand={mascotBrand} size={size} /><figcaption>{size} px</figcaption></figure>)}</div>
        </article>)}
      </div>}
    </div>
  );
}
const root = createRootRoute();
const site = createRoute({
  getParentRoute: () => root,
  path: base,
  component: () => <SiteShell data={bootstrap} brand={brand} />,
});
const page = createRoute({ getParentRoute: () => site, path: "/", component: PreviewContent });
const catchAll = createRoute({
  getParentRoute: () => site,
  path: "$",
  component: () => (
    <div className="bot-preview-page">
      <h1>Link ilustrativo da prévia</h1>
      <p>Este catálogo é sintético. Volte para avaliar a conversa.</p>
      <a href={base}>Voltar</a>
    </div>
  ),
});
const router = createRouter({ routeTree: root.addChildren([site.addChildren([page, catchAll])]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
