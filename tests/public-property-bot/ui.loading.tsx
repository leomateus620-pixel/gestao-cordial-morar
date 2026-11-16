import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { SiteShell } from "../../src/components/cordial-site/SiteShell";
import { settingsSchema } from "../../src/lib/cordial-site/contract";
import { newDraft, type ChatInput } from "../../src/lib/public-property-bot/contracts";
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  send: vi.fn(),
  rejectVoice: null as null | ((error: Error) => void),
}));
vi.mock("../../src/components/public-property-bot/events", async (original) => ({
  ...(await original<object>()),
  recordBotOpen: vi.fn(),
}));
vi.mock("../../src/components/public-property-bot/Panel", async () => {
  throw new Error("Synthetic panel chunk failure");
});
vi.mock(
  "../../src/components/public-property-bot/VoiceCapture",
  async () =>
    await new Promise((_resolve, reject) => {
      mocks.rejectVoice = reject;
    }),
);
vi.mock("../../src/components/public-property-bot/transport", async (original) => ({
  ...(await original<object>()),
  openSession: mocks.open,
  sendTurn: mocks.send,
}));
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.open.mockResolvedValue({
    draft: newDraft(),
    turns: [],
    enabled: true,
    voice: true,
    suggestions: [],
    contactHref: "/site/contato",
  });
  mocks.send.mockImplementation(
    async (
      _brand: string,
      input: ChatInput,
      _signal: AbortSignal,
      receive: (event: unknown) => void,
    ) => {
      receive({
        type: "done",
        sequence: 0,
        requestId: input.requestId,
        revision: 1,
        result: {
          requestId: input.requestId,
          draft: { ...newDraft(), revision: 1 },
          answer: "Busca por texto preservada.",
          cards: [],
          question: null,
          exhausted: false,
          unavailable: false,
        },
      });
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("falha do chunk do painel preserva SiteShell, contato central, foco e busca comum", async () => {
  const bootstrap = {
    available: true,
    indexable: false,
    canonicalOrigin: null,
    settings: settingsSchema.parse({ whatsapp: "5555999999999" }),
    facets: { types: [], cities: [], districts: [], stages: [], total: 0 },
  };
  const root = createRootRoute({ component: () => <SiteShell data={bootstrap} /> });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/site",
    component: () => <h1>Catálogo público de teste</h1>,
  });
  const search = createRoute({
    getParentRoute: () => root,
    path: "/site/buscar",
    component: () => <h1>Busca comum funcionando</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, search]),
    history: createMemoryHistory({ initialEntries: ["/site"] }),
  });
  render(<RouterProvider router={router} />);
  const launch = await screen.findByRole("button", { name: "Abrir Cordial Bot" });
  fireEvent.click(launch);
  await screen.findByText(/O assistente não carregou agora/);
  expect(document.querySelector(".cs-header")).toBeTruthy();
  expect(screen.getByRole("link", { name: "WhatsApp da equipe" }).getAttribute("href")).toContain(
    "https://wa.me/5555999999999?",
  );
  fireEvent.click(screen.getByRole("button", { name: "Fechar conversa" }));
  await waitFor(() => expect(document.activeElement).toBe(launch));
  expect(screen.getByRole("link", { name: "Conversar com a Cordial no WhatsApp" })).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Navegação principal" })).getByRole("link", {
      name: "Comprar",
    }),
  );
  await screen.findByRole("heading", { name: "Busca comum funcionando" });
});
it("falha do chunk de voz preserva rascunho, painel e envio por texto", async () => {
  const { default: Panel } = await vi.importActual<
    typeof import("../../src/components/public-property-bot/Panel")
  >("../../src/components/public-property-bot/Panel");
  render(
    <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="voice-failure-panel" />,
  );
  await screen.findByRole("button", { name: "Comprar" });
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Quero uma casa com dois quartos" },
  });
  await waitFor(() => expect(mocks.rejectVoice).toBeTypeOf("function"));
  await act(async () => mocks.rejectVoice!(new Error("Synthetic voice chunk failure")));
  await screen.findByText("Voz indisponível");
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "Quero uma casa com dois quartos",
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await screen.findAllByText("Busca por texto preservada.");
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][1].action).toEqual({
    kind: "text",
    text: "Quero uma casa com dois quartos",
  });
});
