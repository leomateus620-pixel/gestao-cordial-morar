import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  newDraft,
  type TurnResult,
  type ChatInput,
} from "../../src/lib/public-property-bot/contracts";
import { CountsQuestion, BudgetQuestion } from "../../src/components/public-property-bot/Questions";
import {
  PropertyCards,
  safeCardUrls,
} from "../../src/components/public-property-bot/PropertyCards";
import { FilterChips, filterLabel } from "../../src/components/public-property-bot/FilterChips";
import Panel from "../../src/components/public-property-bot/Panel";
const mocks = vi.hoisted(() => ({ open: vi.fn(), send: vi.fn(), transcribe: vi.fn() }));
vi.mock("../../src/components/public-property-bot/transport", async (original) => ({
  ...(await original<object>()),
  openSession: mocks.open,
  sendTurn: mocks.send,
  transcribe: mocks.transcribe,
}));
const id = "10000000-0000-4000-8000-000000000001";
const card = {
  id,
  version: "a".repeat(32),
  reference: "TESTE-1",
  title: "Casa de teste",
  location: "Bairro sintético com nome muito longo · Cidade de teste",
  price: "R$ 650.000",
  bedrooms: 2,
  bathrooms: null,
  features: [],
  detailPath: `/site/imovel/casa-${id}`,
  imagePath: null,
  whatsappUrl: "https://wa.me/5555999999999?text=Referencia",
  alternative: [],
};
const session = () => ({
  draft: newDraft(),
  turns: [],
  enabled: true,
  voice: false,
  suggestions: [],
  contactHref: "/site/contato",
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.open.mockResolvedValue(session());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("formulários públicos", () => {
  it("cards de quartos/banheiros escolhem quantidades exatas em um único envio", () => {
    const submit = vi.fn();
    render(<CountsQuestion filters={newDraft().filters} disabled={false} onSubmit={submit} />);
    const bedrooms = within(screen.getByRole("group", { name: "Quartos", exact: true }));
    const bathrooms = within(screen.getByRole("group", { name: "Banheiros", exact: true }));
    expect(bedrooms.getAllByRole("radio")).toHaveLength(11);
    expect(bathrooms.getAllByRole("radio")).toHaveLength(11);
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(bedrooms.getByRole("radio", { name: "2 quartos" }));
    fireEvent.click(bathrooms.getByRole("radio", { name: "3 banheiros" }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toEqual({
      kind: "filters",
      patch: { bedrooms: { value: 2, op: "eq" }, bathrooms: { value: 3, op: "eq" } },
      countsAnswered: true,
    });
    expect(filterLabel("bedrooms", submit.mock.calls[0][0].patch.bedrooms)).not.toContain("+");
  });
  it("sem preferência não vira zero e pergunta obsoleta não envia", () => {
    const submit = vi.fn();
    const view = render(
      <CountsQuestion filters={newDraft().filters} disabled={false} onSubmit={submit} />,
    );
    const bedrooms = within(screen.getByRole("group", { name: "Quartos", exact: true }));
    fireEvent.click(bedrooms.getByRole("radio", { name: "2 quartos" }));
    fireEvent.click(bedrooms.getByRole("radio", { name: "Sem preferência" }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(submit.mock.calls[0][0].patch).toEqual({ bedrooms: null, bathrooms: null });
    view.rerender(<CountsQuestion filters={newDraft().filters} disabled onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("confirmar sem mexer nos grupos preserva todos os operadores herdados", () => {
    const submit = vi.fn();
    const filters = {
      ...newDraft().filters,
      bedrooms: { value: 3, op: "gte" as const },
      bathrooms: { value: 2, op: "lt" as const },
    };
    render(<CountsQuestion filters={filters} disabled={false} onSubmit={submit} />);
    const group = screen.getByRole("group", { name: "Quartos", exact: true });
    expect(document.getElementById(group.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Filtro atual: 3+ quartos",
    );
    expect(
      (within(group).getByRole("radio", { name: "3 quartos" }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(submit.mock.calls[0][0].patch).toEqual({
      bedrooms: filters.bedrooms,
      bathrooms: filters.bathrooms,
    });
  });
  it("clicar novamente no número herdado converte só aquele grupo para quantidade exata", () => {
    const submit = vi.fn();
    const filters = {
      ...newDraft().filters,
      bedrooms: { value: 3, op: "gte" as const },
      bathrooms: { value: 2, op: "gte" as const },
    };
    render(<CountsQuestion filters={filters} disabled={false} onSubmit={submit} />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Quartos", exact: true })).getByRole("radio", {
        name: "3 quartos",
      }),
    );
    expect(screen.queryByText("Filtro atual: 3+ quartos")).toBeNull();
    expect(screen.getByText("Filtro atual: 2+ banheiros")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(submit.mock.calls[0][0].patch).toEqual({
      bedrooms: { value: 3, op: "eq" },
      bathrooms: filters.bathrooms,
    });
  });
  it("setas do teclado percorrem radios de um grupo sem enviar ou alterar o outro", async () => {
    const submit = vi.fn();
    render(<CountsQuestion filters={newDraft().filters} disabled={false} onSubmit={submit} />);
    const bedrooms = within(screen.getByRole("group", { name: "Quartos", exact: true }));
    const first = bedrooms.getByRole("radio", { name: "1 quarto" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    const second = bedrooms.getByRole("radio", { name: "2 quartos" });
    expect(document.activeElement).toBe(second);
    expect((second as HTMLInputElement).checked).toBe(true);
    expect(
      (
        within(screen.getByRole("group", { name: "Banheiros", exact: true })).getByRole("radio", {
          name: "Sem preferência",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(submit.mock.calls[0][0].patch).toEqual({
      bedrooms: { value: 2, op: "eq" },
      bathrooms: null,
    });
  });
  it("acima de usa piso exclusivo e aluguel mostra faixas mensais próprias", () => {
    const submit = vi.fn();
    const view = render(<BudgetQuestion operation="venda" disabled={false} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: /Acima de.*1.000.000/ }));
    expect(submit.mock.calls[0][0].patch.budget).toEqual({
      min: { value: 1000000, inclusive: false },
      max: null,
    });
    view.rerender(<BudgetQuestion operation="aluguel" disabled={false} onSubmit={submit} />);
    expect(screen.queryByRole("button", { name: /200.000/ })).toBeNull();
    expect(screen.getByText("Aluguel mensal, sem encargos")).toBeTruthy();
  });
  it("alterar chips espera uma confirmação explícita", () => {
    const submit = vi.fn();
    render(
      <FilterChips
        filters={{ ...newDraft().filters, city: "Cidade de teste", district: "Centro" }}
        disabled={false}
        onApply={submit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover filtro de bairro" }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar busca" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith({ district: null });
  });
});
describe("cards públicos", () => {
  it("omite contagem desconhecida e usa links independentes sem botão aninhado", () => {
    render(<PropertyCards brand="cordial" cards={[card]} />);
    expect(screen.queryByText(/0 banheiros/)).toBeNull();
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toContain(
      "wa.me/5555999999999",
    );
    expect(document.querySelector("a a,a button")).toBeNull();
  });
  it("recusa caminhos de outra marca e URLs externas para detalhe/foto", () => {
    expect(safeCardUrls(card, "morar").detail).toBeNull();
    expect(
      safeCardUrls(
        {
          ...card,
          detailPath: "https://evil.invalid",
          imagePath: "https://evil.invalid/photo",
          whatsappUrl: "javascript:alert(1)",
        },
        "cordial",
      ),
    ).toEqual({ detail: null, image: null, contact: "/site/contato" });
  });
});
describe("conversa", () => {
  it("foca o compositor e não remove o último resultado ao esgotar no 25º turno", async () => {
    mocks.send.mockImplementation(
      async (
        _brand: string,
        input: ChatInput,
        _signal: AbortSignal,
        receive: (event: unknown) => void,
      ) => {
        const result: TurnResult = {
          requestId: input.requestId,
          draft: { ...newDraft(), revision: 1, countsAnswered: true, budgetAnswered: true },
          answer: "Encontrei uma opção.",
          cards: [card],
          question: null,
          exhausted: true,
          unavailable: false,
        };
        receive({ type: "results", requestId: input.requestId, sequence: 1, revision: 1, result });
        receive({ type: "quota_exhausted", requestId: input.requestId, sequence: 2, revision: 1 });
        receive({ type: "done", requestId: input.requestId, sequence: 3, revision: 1, result });
      },
    );
    render(<Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="test-panel" />);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
    const textbox = screen.getByRole("textbox");
    expect(document.activeElement).toBe(textbox);
    fireEvent.change(textbox, { target: { value: "Uma casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await screen.findByText("Encontrei uma opção.");
    expect(screen.getAllByText("Casa de teste")).toHaveLength(1);
    expect(screen.getByText(/Por hoje, continue/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar mensagem" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(document.body.textContent).not.toContain("25/25");
  });
  it("ignora resposta atrasada depois de fechar e preserva retry requestId", async () => {
    let resolve: (() => void) | undefined, deliver: ((event: unknown) => void) | undefined;
    mocks.send.mockImplementation(
      (
        _brand: string,
        _input: ChatInput,
        _signal: AbortSignal,
        receive: (event: unknown) => void,
      ) => {
        deliver = receive;
        return new Promise<void>((r) => {
          resolve = r;
        });
      },
    );
    const view = render(
      <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="test-panel" />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Comprar" })).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Quero uma casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    const input = mocks.send.mock.calls[0][1] as ChatInput;
    view.rerender(
      <Panel brand="cordial" whatsapp="" open={false} onOpenChange={() => {}} id="test-panel" />,
    );
    act(() => {
      deliver?.({
        type: "done",
        sequence: 4,
        revision: 1,
        requestId: input.requestId,
        result: {
          requestId: input.requestId,
          draft: { ...newDraft(), revision: 1 },
          answer: "RESPOSTA ATRASADA",
          cards: [],
          question: null,
          exhausted: false,
          unavailable: false,
        },
      });
      resolve?.();
    });
    view.rerender(
      <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="test-panel" />,
    );
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("RESPOSTA ATRASADA")).toBeNull();
  });
  it("erro preserva contato e recuperar envio reutiliza o identificador", async () => {
    mocks.send.mockRejectedValueOnce(new Error("network"));
    mocks.send.mockImplementationOnce(async () => {});
    render(<Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="test-panel" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Comprar" })).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Uma casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar envio" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    expect(mocks.send.mock.calls[1][1].requestId).toBe(mocks.send.mock.calls[0][1].requestId);
    expect(screen.getByRole("link", { name: "Abrir contato da equipe" })).toBeTruthy();
  });
  it("permite teclado/Escape e comunica indisponibilidade sem fingir catálogo vazio", async () => {
    mocks.open.mockRejectedValue(new Error("not configured"));
    const close = vi.fn();
    render(<Panel brand="morar" whatsapp="" open onOpenChange={close} id="test-panel" />);
    await screen.findByText(/A busca por conversa está indisponível/);
    expect(screen.queryByText(/Não encontrei/)).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledWith(false);
  });
  it("reabrir respeita esgotamento do servidor e libera após renovação sem apagar resultados", async () => {
    const persisted = {
      ...session(),
      turns: [{ requestId: id, answer: "Opção já encontrada.", cards: [card] }],
      exhausted: true,
    };
    mocks.open
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce({ ...persisted, exhausted: false });
    const view = render(
      <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="renewal-panel" />,
    );
    await screen.findByText(/Por hoje, continue/);
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Casa de teste")).toBeTruthy();
    expect(mocks.send).not.toHaveBeenCalled();
    view.rerender(
      <Panel brand="cordial" whatsapp="" open={false} onOpenChange={() => {}} id="renewal-panel" />,
    );
    view.rerender(
      <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="renewal-panel" />,
    );
    await waitFor(() => expect(screen.queryByText(/Por hoje, continue/)).toBeNull());
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Casa de teste")).toBeTruthy();
  });
});

it("reabrir durante um envio preserva mensagem pendente e recuperação idempotente", async () => {
  mocks.send.mockImplementation(() => new Promise<void>(() => {}));
  const view = render(
    <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="pending-panel" />,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Comprar" })).toBeTruthy());
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mensagem pendente" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  expect(screen.getByText("Mensagem pendente")).toBeTruthy();
  const first = mocks.send.mock.calls[0][1] as ChatInput;
  view.rerender(
    <Panel brand="cordial" whatsapp="" open={false} onOpenChange={() => {}} id="pending-panel" />,
  );
  view.rerender(
    <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="pending-panel" />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Recuperar envio" }));
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(mocks.send.mock.calls[1][1].requestId).toBe(first.requestId);
  expect(screen.getByText("Mensagem pendente")).toBeTruthy();
});
it.each([true, false])(
  "reabertura offline omite snapshots e usa só nova validação (retirado: %s)",
  async (withdrawn) => {
    const initial = {
      ...session(),
      turns: [{ requestId: id, answer: "Opção encontrada anteriormente.", cards: [card] }],
    };
    mocks.open
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ...initial,
        turns: [
          {
            requestId: id,
            answer: withdrawn
              ? "Este anúncio não está mais disponível."
              : "Anúncio confirmado agora.",
            cards: withdrawn ? [] : [{ ...card, price: "R$ 620.000" }],
          },
        ],
      });
    const view = render(
      <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="revalidate-panel" />,
    );
    await screen.findByText("R$ 650.000");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Meu rascunho preservado" } });
    view.rerender(
      <Panel
        brand="cordial"
        whatsapp=""
        open={false}
        onOpenChange={() => {}}
        id="revalidate-panel"
      />,
    );
    view.rerender(
      <Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="revalidate-panel" />,
    );
    await screen.findByText("Não foi possível confirmar estes anúncios agora.");
    expect(screen.queryByText("R$ 650.000")).toBeNull();
    expect(screen.queryByRole("link", { name: /Ver imóvel/ })).toBeNull();
    expect(screen.getByRole("textbox").getAttribute("disabled")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Meu rascunho preservado",
    );
    expect(screen.getByRole("link", { name: "Abrir contato da equipe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir busca" }));
    await screen.findAllByText(
      withdrawn ? "Este anúncio não está mais disponível." : "Anúncio confirmado agora.",
    );
    expect(screen.queryByText("R$ 650.000")).toBeNull();
    expect(screen.queryByText("Não foi possível confirmar estes anúncios agora.")).toBeNull();
    if (withdrawn) expect(screen.queryByRole("link", { name: /Ver imóvel/ })).toBeNull();
    else expect(screen.getByText("R$ 620.000")).toBeTruthy();
  },
);
it.each([true, false])(
  "revela a primeira opção sem puxar quem lê acima (perto do fim: %s)",
  async (atEnd) => {
    let receive!: (event: unknown) => void;
    let finish!: () => void;
    mocks.send.mockImplementation(
      (_brand: string, _input: ChatInput, _signal: AbortSignal, callback: typeof receive) => {
        receive = callback;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, this.classList.contains("ppb-bot-message") ? 300 : 100, 470, 500);
    });
    render(<Panel brand="cordial" whatsapp="" open onOpenChange={() => {}} id="scroll-panel" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Comprar" })).toBeTruthy());
    const scroll = document.querySelector<HTMLElement>(".ppb-scroll")!;
    Object.defineProperties(scroll, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 700 },
    });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mostre três casas" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(scroll.scrollTop).toBe(1000));
    scroll.scrollTop = atEnd ? 300 : 0;
    fireEvent.scroll(scroll);
    const input = mocks.send.mock.calls[0][1] as ChatInput;
    const result: TurnResult = {
      requestId: input.requestId,
      draft: { ...newDraft(), revision: 1, countsAnswered: true, budgetAnswered: true },
      answer: "Encontrei três opções.",
      cards: [
        card,
        { ...card, id: "10000000-0000-4000-8000-000000000002" },
        { ...card, id: "10000000-0000-4000-8000-000000000003" },
      ],
      question: null,
      exhausted: false,
      unavailable: false,
    };
    act(() =>
      receive({ type: "results", sequence: 1, revision: 1, requestId: input.requestId, result }),
    );
    if (atEnd) await waitFor(() => expect(scroll.scrollTop).toBe(488));
    else {
      expect(scroll.scrollTop).toBe(0);
      fireEvent.click(await screen.findByRole("button", { name: "Nova resposta" }));
      expect(scroll.scrollTop).toBe(188);
    }
    act(() => {
      receive({ type: "done", sequence: 2, revision: 1, requestId: input.requestId, result });
      finish();
    });
    await waitFor(() => expect(screen.queryByText("Enviando pedido")).toBeNull());
    expect(scroll.scrollTop).toBe(atEnd ? 488 : 188);
  },
);
it("editar contagem exata mantém operador visível até confirmar", () => {
  const apply = vi.fn();
  render(
    <FilterChips
      filters={{ ...newDraft().filters, bedrooms: { op: "eq", value: 2 } }}
      disabled={false}
      onApply={apply}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Editar quartos: Exatamente 2 quartos" }));
  expect((screen.getByLabelText("Como contar") as HTMLSelectElement).value).toBe("eq");
  fireEvent.change(screen.getByLabelText("Quartos"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar alteração" }));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar busca" }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ bedrooms: { value: 3, op: "eq" } });
});
it("URLs não permitem atravessar rotas por segmentos de caminho", () => {
  expect(
    safeCardUrls(
      {
        ...card,
        detailPath: `/site/imovel/../privado/${card.id}`,
        imagePath: "/api/cordial-site/media/../../admin",
      },
      "cordial",
    ),
  ).toMatchObject({ detail: null, image: null });
  const image = `/api/cordial-site/media/${card.id}/${"a".repeat(32)}/card?enhancement=${"b".repeat(64)}`;
  expect(safeCardUrls({ ...card, imagePath: image }, "cordial").image).toBe(image);
});
