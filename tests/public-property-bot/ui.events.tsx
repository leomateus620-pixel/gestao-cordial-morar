import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  newDraft,
  type BotCard,
  type BotEvent,
  type ChatInput,
  type Suggestion,
  type TurnResult,
} from "../../src/lib/public-property-bot/contracts";
import { suggestionEvent, recordBotContact } from "../../src/components/public-property-bot/events";
import Panel from "../../src/components/public-property-bot/Panel";
const mocks = vi.hoisted(() => ({ open: vi.fn(), send: vi.fn() }));
vi.mock("../../src/components/public-property-bot/transport", async (original) => ({
  ...(await original<object>()),
  openSession: mocks.open,
  sendTurn: mocks.send,
}));
const suggestion: Suggestion = {
  id: "budget-650000",
  label: "SENTINELA TEXTO LIVRE",
  patch: { operation: "venda", budget: { min: null, max: { value: 650000, inclusive: true } } },
};
const card: BotCard = {
  id: "10000000-0000-4000-8000-000000000001",
  version: "a".repeat(32),
  reference: "SENTINELA-REF",
  title: "Imóvel sintético",
  location: "SENTINELA-BAIRRO",
  price: "R$ 650.000",
  bedrooms: null,
  bathrooms: null,
  features: [],
  detailPath: "/site/imovel/casa-10000000-0000-4000-8000-000000000001",
  imagePath: null,
  whatsappUrl: "https://wa.me/5555999999999?text=SENTINELA-CONTATO",
  alternative: [],
};
const fetcher = vi.fn();
const preventNavigation = (event: Event) => {
  if ((event.target as HTMLElement)?.closest?.("a")) event.preventDefault();
};
const session = () => ({
  draft: newDraft(),
  turns: [],
  enabled: true,
  voice: false,
  suggestions: [suggestion],
  contactHref: "/site/contato",
});
const sentBodies = () => fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
beforeEach(() => {
  document.addEventListener("click", preventNavigation);
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValue(Response.json({ accepted: true }));
  mocks.open.mockResolvedValue(session());
});
afterEach(() => {
  document.removeEventListener("click", preventNavigation);
  cleanup();
  vi.unstubAllGlobals();
});
it("consentimento negado ou ausente não transmite eventos e falha de analytics não bloqueia", () => {
  expect(suggestionEvent("cordial", "search", suggestion)).toBe(false);
  localStorage.setItem("cordial:analytics-consent", "denied");
  expect(suggestionEvent("morar", "impression", suggestion)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  localStorage.setItem("cordial:analytics-consent", "granted");
  fetcher.mockRejectedValueOnce(new Error("network"));
  expect(suggestionEvent("morar", "search", suggestion)).toBe(true);
});
it("payload contém apenas campos normalizados e fica no endpoint da marca", () => {
  localStorage.setItem("cordial:analytics-consent", "granted");
  suggestionEvent("morar", "open", suggestion);
  expect(fetcher.mock.calls[0][0]).toBe("/api/morar-site/bot/events");
  const body = sentBodies()[0];
  expect(Object.keys(body).sort()).toEqual([
    "category",
    "consent",
    "eventId",
    "kind",
    "suggestionId",
  ]);
  expect(body).toMatchObject({
    kind: "open",
    category: "budget",
    suggestionId: suggestion.id,
    consent: true,
  });
  expect(JSON.stringify(body)).not.toContain("SENTINELA");
});
it("somente sugestões visíveis recebem impressão; histórico não gera impressão oculta", async () => {
  localStorage.setItem("cordial:analytics-consent", "granted");
  mocks.open.mockResolvedValue({
    ...session(),
    turns: [
      { requestId: "20000000-0000-4000-8000-000000000001", answer: "Histórico", cards: [card] },
    ],
  });
  render(<Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="events-panel" />);
  await screen.findAllByText("Histórico");
  expect(sentBodies().filter((body) => body.kind !== "panel_open")).toHaveLength(0);
  fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
  expect(sentBodies()).toHaveLength(2);
  expect(sentBodies()[1]).toMatchObject({
    kind: "contact_click",
    publicId: card.id,
    source: "card",
  });
});
it("atribui cliques só ao turno da sugestão, deduplica por ação e preserva vínculo apenas em memória", async () => {
  localStorage.setItem("cordial:analytics-consent", "granted");
  let result: TurnResult;
  mocks.send.mockImplementation(
    async (
      _brand: string,
      input: ChatInput,
      _signal: AbortSignal,
      receive: (event: BotEvent) => void,
    ) => {
      result = {
        requestId: input.requestId,
        draft: {
          ...newDraft(),
          revision: 1,
          countsAnswered: true,
          budgetAnswered: true,
          filters: { ...newDraft().filters, operation: "venda" },
        },
        answer: "Uma opção da sugestão.",
        cards: [card],
        question: null,
        exhausted: false,
        unavailable: false,
      };
      receive({ type: "accepted", sequence: 0, revision: 0, requestId: input.requestId });
      receive({ type: "results", sequence: 1, revision: 1, requestId: input.requestId, result });
      receive({ type: "done", sequence: 2, revision: 1, requestId: input.requestId, result });
    },
  );
  const view = render(
    <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="events-panel" />,
  );
  fireEvent.click(await screen.findByRole("button", { name: suggestion.label }));
  await screen.findAllByText("Uma opção da sugestão.");
  expect(sentBodies().filter((body) => body.kind === "impression")).toHaveLength(1);
  expect(sentBodies().filter((body) => body.kind === "search")).toHaveLength(1);
  fireEvent.click(screen.getByRole("link", { name: "Ver imóvel" }));
  fireEvent.click(screen.getByRole("link", { name: "Ver imóvel" }));
  fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
  expect(sentBodies().filter((body) => body.kind === "open")).toHaveLength(1);
  expect(sentBodies().filter((body) => body.kind === "whatsapp")).toHaveLength(1);
  expect(JSON.stringify(sentBodies())).not.toContain("SENTINELA");
  const total = fetcher.mock.calls.length;
  mocks.open.mockResolvedValue({
    ...session(),
    draft: result!.draft,
    turns: [{ requestId: result!.requestId, answer: result!.answer, cards: [card] }],
  });
  view.rerender(
    <Panel brand="cordial" whatsapp="" open={false} onOpenChange={() => {}} id="events-panel" />,
  );
  view.rerender(
    <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="events-panel" />,
  );
  await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
  expect(fetcher).toHaveBeenCalledTimes(total + 2);
  // A new component only has server history, which intentionally contains no visitor attribution.
  view.unmount();
  render(<Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="events-new-panel" />);
  await screen.findAllByText("Uma opção da sugestão.");
  fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
  expect(fetcher).toHaveBeenCalledTimes(total + 4);
});
it("acompanhamento interno registra clique com consentimento de marketing negado sem enviar conversa", () => {
  localStorage.setItem("cordial:analytics-consent", "denied");
  recordBotContact("morar", "header");
  expect(fetcher.mock.calls[0][0]).toBe("/api/morar-site/bot/events");
  expect(fetcher.mock.calls[0][1].keepalive).toBe(true);
  expect(Object.keys(sentBodies()[0]).sort()).toEqual(["eventId", "kind", "publicId", "source"]);
  expect(sentBodies()[0]).toMatchObject({
    kind: "contact_click",
    source: "header",
    publicId: null,
  });
  expect(suggestionEvent("morar", "whatsapp", suggestion)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("confirma abertura somente após sessão carregada e reutiliza a identidade no retry", async () => {
  localStorage.setItem("cordial:analytics-consent", "denied");
  mocks.open.mockRejectedValueOnce(new Error("resposta da primeira abertura perdida"));
  const view = render(
    <Panel brand="morar" whatsapp="" open onOpenChange={() => {}} id="opening-panel" />,
  );
  const retry = await screen.findByRole("button", { name: "Reabrir busca" });
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await waitFor(() => expect(sentBodies()).toHaveLength(1));
  const firstId = mocks.open.mock.calls[0][2];
  expect(mocks.open.mock.calls[1][2]).toBe(firstId);
  expect(sentBodies()[0]).toEqual({ kind: "panel_open", eventId: firstId });
  expect(fetcher.mock.calls[0][0]).toBe("/api/morar-site/bot/events");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", keepalive: true });
  view.rerender(
    <Panel brand="morar" whatsapp="" open={false} onOpenChange={() => {}} id="opening-panel" />,
  );
  view.rerender(
    <Panel brand="morar" whatsapp="" open onOpenChange={() => {}} id="opening-panel" />,
  );
  await waitFor(() => expect(sentBodies()).toHaveLength(2));
  expect(sentBodies()[1].kind).toBe("panel_open");
  expect(sentBodies()[1].eventId).not.toBe(firstId);
});

it("não confirma abertura falha nem uma resposta de sessão recebida depois de fechar", async () => {
  localStorage.setItem("cordial:analytics-consent", "denied");
  let resolve!: (value: ReturnType<typeof session>) => void;
  mocks.open.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(
    <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="late-opening-panel" />,
  );
  expect(fetcher).not.toHaveBeenCalled();
  view.rerender(
    <Panel
      brand="cordial"
      whatsapp=""
      open={false}
      onOpenChange={() => {}}
      id="late-opening-panel"
    />,
  );
  await act(async () => {
    resolve(session());
  });
  expect(fetcher).not.toHaveBeenCalled();
});
