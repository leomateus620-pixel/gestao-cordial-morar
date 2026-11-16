import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PublicBotInsightsView,
  type PublicBotInsightsViewProps,
} from "@/components/dashboard/PublicBotInsightsView";
import { PublicBotInsightsSection } from "@/components/dashboard/PublicBotInsights";
import {
  botConversationDetailSchema,
  botConversationListSchema,
  botInsightsSchema,
} from "@/lib/public-bot-insights/contracts";
import { conversationFixture, detailFixture, listFixture, overviewFixture } from "./ui-fixtures";

const connected = vi.hoisted(() => ({
  profile: "admin_owner" as string | null,
  overview: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/lib/auth-mock", () => ({
  useSession: () => (connected.profile ? { perfil: connected.profile } : null),
}));
vi.mock("@/hooks/usePublicBotInsights", () => ({
  usePublicBotInsights: connected.overview,
  usePublicBotConversations: connected.list,
  usePublicBotConversation: connected.detail,
}));

const query = <T,>(data?: T) => ({
  data,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
});
function props(): PublicBotInsightsViewProps {
  return {
    days: 7,
    onDaysChange: vi.fn(),
    brand: null,
    onBrandChange: vi.fn(),
    page: 1,
    onPageChange: vi.fn(),
    conversationId: null,
    onConversationChange: vi.fn(),
    overview: query(overviewFixture()),
    conversations: query(listFixture()),
    detail: query(detailFixture()),
  };
}
beforeEach(() => {
  connected.profile = "admin_owner";
  connected.overview.mockReset().mockImplementation((days) => query(overviewFixture(days)));
  connected.list
    .mockReset()
    .mockImplementation((brand, _days, page) => query(listFixture(brand ?? "cordial", page)));
  connected.detail.mockReset().mockImplementation((brand, id) => {
    const item = listFixture(brand ?? "cordial").items.find((entry) => entry.id === id);
    return query(detailFixture(item));
  });
});
afterEach(cleanup);

describe("admin dashboard access and navigation", () => {
  it.each([
    null,
    "meta_reviewer",
    "atendimentos_viewer",
    "corretor",
    "secretaria",
    "financeiro_admin",
  ])("does not mount or query the section for %s", (profile) => {
    connected.profile = profile;
    const { container } = render(<PublicBotInsightsSection />);
    expect(container.textContent).toBe("");
    expect(connected.overview).not.toHaveBeenCalled();
    expect(connected.list).not.toHaveBeenCalled();
    expect(connected.detail).not.toHaveBeenCalled();
  });

  it("starts at seven days and resets pagination and detail when period or brand changes", async () => {
    const user = userEvent.setup();
    render(<PublicBotInsightsSection />);
    expect((screen.getByRole("radio", { name: "7 dias" }) as HTMLInputElement).checked).toBe(true);
    await user.click(
      within(screen.getByRole("article", { name: "Cordial Bot" })).getByRole("button", {
        name: "Ver sessões",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(connected.list).toHaveBeenLastCalledWith("cordial", 7, 2);
    await user.click(screen.getByRole("radio", { name: "Hoje" }));
    expect(connected.list).toHaveBeenLastCalledWith("cordial", 1, 1);
    expect(connected.detail).toHaveBeenLastCalledWith("cordial", null);
    await user.click(
      within(screen.getByRole("article", { name: "Morar Bot" })).getByRole("button", {
        name: "Ver sessões",
      }),
    );
    expect(connected.list).toHaveBeenLastCalledWith("morar", 1, 1);
    expect(connected.detail).toHaveBeenLastCalledWith("morar", null);
    expect(screen.getByRole("heading", { name: "Sessões do Morar Bot" })).toBe(
      document.activeElement,
    );
    await user.click(screen.getByRole("radio", { name: "30 dias" }));
    expect(connected.overview).toHaveBeenLastCalledWith(30);
    expect(connected.list).toHaveBeenLastCalledWith("morar", 30, 1);
    expect(connected.detail).toHaveBeenLastCalledWith("morar", null);
  });

  it("loads the exact selected brand and analytical id, then restores focus when closing", async () => {
    const user = userEvent.setup();
    render(<PublicBotInsightsSection />);
    await user.click(
      within(screen.getByRole("article", { name: "Morar Bot" })).getByRole("button", {
        name: "Ver sessões",
      }),
    );
    const row = document.querySelector<HTMLButtonElement>(".pbi-session-row")!;
    await user.click(row);
    expect(connected.detail).toHaveBeenLastCalledWith("morar", conversationFixture("morar").id);
    const dialog = screen.getByRole("dialog", { name: "Detalhes da sessão" });
    expect(within(dialog).getByText("Morar Bot")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row));
  });
});

describe("truthful metrics, daily history and query states", () => {
  it("keeps fixtures compatible with the actual strict contracts", () => {
    expect(botInsightsSchema.safeParse(overviewFixture()).success).toBe(true);
    expect(botConversationListSchema.safeParse(listFixture()).success).toBe(true);
    expect(botConversationDetailSchema.safeParse(detailFixture()).success).toBe(true);
    const rental = detailFixture(conversationFixture("morar", 1));
    expect(rental.evolution.filter((event) => event.kind === "turn")).toHaveLength(rental.messages);
    expect(rental.evolution.filter((event) => event.kind === "whatsapp")).toHaveLength(
      rental.whatsapp,
    );
    expect(rental.evolution[0].question).toContain("alugar");
    expect(rental.evolution[1].question).toContain("por mês");
    expect(rental.initialFilters.operation).toBe("aluguel");
  });

  it("has two separately labeled cards and daily values accessible without the chart", () => {
    render(<PublicBotInsightsView {...props()} />);
    const cordial = within(screen.getByRole("article", { name: "Cordial Bot" }));
    const morar = within(screen.getByRole("article", { name: "Morar Bot" }));
    expect(cordial.getByText("Acessos", { selector: "dt" })).toBeTruthy();
    expect(morar.getByText("Cliques no WhatsApp")).toBeTruthy();
    expect(
      cordial.getByRole("table", { name: "Conversas iniciadas por dia do Cordial Bot" }),
    ).toBeTruthy();
    expect(
      morar.getByRole("table", { name: "Conversas iniciadas por dia do Morar Bot" }),
    ).toBeTruthy();
    expect(
      screen.getByText("WhatsApp registra cliques; não confirma contato ou fechamento."),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/período anterior/i)).toBeNull();
  });

  it("distinguishes real empty activity from loading and failure, without manufacturing zero totals", async () => {
    const p = props();
    const { rerender, container } = render(
      <PublicBotInsightsView
        {...p}
        overview={{ ...p.overview, isLoading: true, data: undefined }}
      />,
    );
    expect(screen.getAllByText("Carregando atividade…")).toHaveLength(2);
    expect(container.querySelector(".pbi-metrics")).toBeNull();
    rerender(<PublicBotInsightsView {...p} overview={{ ...p.overview, isError: true }} />);
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível");
    expect(container.querySelector(".pbi-metrics")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(p.overview.refetch).toHaveBeenCalledTimes(1);
    const empty = overviewFixture();
    empty.brands = empty.brands.map((item) => ({
      ...item,
      opens: 0,
      sessions: 0,
      conversations: 0,
      messages: 0,
      whatsapp: 0,
      daily: [],
    }));
    rerender(<PublicBotInsightsView {...p} overview={query(empty)} />);
    expect(screen.getAllByText("Sem atividade registrada neste período.")).toHaveLength(2);
    expect(container.querySelectorAll(".pbi-metrics dd")).toHaveLength(8);
    expect(
      [...container.querySelectorAll(".pbi-metrics dd")].every((item) => item.textContent === "0"),
    ).toBe(true);
  });

  it("does not present old-period totals while the new period resolves", () => {
    const p = props();
    render(<PublicBotInsightsView {...p} days={30} />);
    expect(screen.getAllByText("Carregando atividade…")).toHaveLength(2);
    expect(document.querySelector(".pbi-metrics")).toBeNull();
  });

  it("makes daily values available on focus and with keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<PublicBotInsightsView {...props()} />);
    const chart = screen.getByRole("group", { name: "Evolução diária do Cordial Bot" });
    await user.click(chart);
    const card = within(screen.getByRole("article", { name: "Cordial Bot" }));
    expect(card.getByRole("status").textContent).toBe("16/11 · 9 conversas");
    await user.keyboard("{Home}");
    expect(card.getByRole("status").textContent).toBe("10/11 · 0 conversas");
    await user.keyboard("{ArrowRight}");
    expect(card.getByRole("status").textContent).toBe("11/11 · 0 conversas");
    await user.keyboard("{End}{ArrowLeft}");
    expect(card.getByRole("status").textContent).toBe("15/11 · 8 conversas");
  });

  it("changes the actual daily series independently for each brand", async () => {
    const user = userEvent.setup();
    render(<PublicBotInsightsView {...props()} />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Métrica diária do Cordial Bot" }),
      "whatsapp",
    );
    await user.click(screen.getByRole("group", { name: "Evolução diária do Cordial Bot" }));
    const cordial = within(screen.getByRole("article", { name: "Cordial Bot" }));
    expect(cordial.getByRole("status").textContent).toBe("16/11 · 6 cliques");
    expect(
      cordial.getByRole("table", { name: "Cliques no WhatsApp por dia do Cordial Bot" }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("combobox", { name: "Métrica diária do Morar Bot" }) as HTMLSelectElement)
        .value,
    ).toBe("conversations");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Métrica diária do Cordial Bot" }),
      "opens",
    );
    await user.click(screen.getByRole("group", { name: "Evolução diária do Cordial Bot" }));
    expect(cordial.getByRole("status").textContent).toBe("16/11 · 22 acessos");
  });

  it("marks incomplete collection using the São Paulo date, not UTC", () => {
    const p = props();
    const data = overviewFixture();
    const { rerender } = render(<PublicBotInsightsView {...p} overview={query(data)} />);
    expect(screen.getByText(/Histórico parcial: coleta iniciada/).textContent).toContain("14/11");
    data.trackingSince = "2026-11-10T02:59:00Z"; // Still Nov 9 in São Paulo.
    rerender(<PublicBotInsightsView {...p} overview={query({ ...data })} />);
    expect(screen.queryByText(/Histórico parcial: coleta iniciada/)).toBeNull();
  });
});

describe("session pagination and selected history", () => {
  it("shows sessions without messages and paginates instead of truncating totals", async () => {
    const p = props();
    const { rerender } = render(<PublicBotInsightsView {...p} brand="cordial" />);
    expect(screen.getByText("Abriu o bot e ainda não enviou uma pergunta.")).toBeTruthy();
    expect(screen.getByText("23 sessões")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(p.onPageChange).toHaveBeenCalledWith(2);
    rerender(
      <PublicBotInsightsView
        {...p}
        brand="cordial"
        page={3}
        conversations={query(listFixture("cordial", 3))}
      />,
    );
    expect(screen.getByText("Página 3 de 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(document.querySelectorAll(".pbi-session-row")).toHaveLength(3);
  });

  it("keeps list errors distinct from no sessions and retries without raw infrastructure errors", async () => {
    const p = props();
    const { rerender } = render(
      <PublicBotInsightsView
        {...p}
        brand="morar"
        conversations={{ ...p.conversations, isError: true }}
      />,
    );
    expect(screen.getByText("Não foi possível carregar as sessões.")).toBeTruthy();
    expect(screen.queryByText("Nenhuma sessão neste período.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(p.conversations.refetch).toHaveBeenCalledOnce();
    rerender(
      <PublicBotInsightsView
        {...p}
        brand="morar"
        conversations={query({ items: [], total: 0, page: 1, pageSize: 10 })}
      />,
    );
    expect(screen.getByText("Nenhuma sessão neste período.")).toBeTruthy();
  });

  it("never renders another brand's rows or a stale selected detail", () => {
    const p = props();
    render(
      <PublicBotInsightsView
        {...p}
        brand="morar"
        conversationId={conversationFixture("morar").id}
      />,
    );
    expect(document.querySelectorAll(".pbi-session-row")).toHaveLength(0);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Carregando a sessão…")).toBeTruthy();
    expect(dialog.queryByText("Quero comprar uma casa de 3 quartos até 650 mil.")).toBeNull();
  });

  it("renders minimized content as text and never creates links from questions or public ids", () => {
    const p = props();
    const detail = detailFixture();
    detail.evolution[0].question = "<img src=x onerror=alert(1)> https://malicious.example [dados]";
    detail.evolution[0].answer = '<script>alert("não executar")</script>';
    render(
      <PublicBotInsightsView
        {...p}
        brand="cordial"
        conversationId={detail.id}
        detail={query(detail)}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(detail.evolution[0].question)).toBeTruthy();
    expect(dialog.querySelector("script,img,a")).toBeNull();
    expect(dialog.textContent).not.toContain(detail.id);
    expect(
      within(dialog).getByText(/O contato com a equipe não é confirmado pelo site/),
    ).toBeTruthy();
  });

  it("shows the explicit truncation notice and both initial and current search profiles", () => {
    const p = props();
    const detail = { ...detailFixture(), evolutionTruncated: true, evolutionTotal: 734 };
    render(
      <PublicBotInsightsView
        {...p}
        brand="cordial"
        conversationId={detail.id}
        detail={query(detail)}
      />,
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Preferências iniciais")).toBeTruthy();
    expect(dialog.getByText("Preferências mais recentes")).toBeTruthy();
    expect(
      dialog.getByText(/Histórico parcial: exibindo os 3 eventos mais recentes de 734 registrados/),
    ).toBeTruthy();
  });

  it("filters the timeline locally without removing the session profile or claiming a contact", async () => {
    const user = userEvent.setup();
    const p = props();
    const detail = detailFixture();
    render(
      <PublicBotInsightsView
        {...p}
        brand="cordial"
        conversationId={detail.id}
        detail={query(detail)}
      />,
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("radio", { name: "WhatsApp" }));
    expect(dialog.queryByText("Quero comprar uma casa de 3 quartos até 650 mil.")).toBeNull();
    expect(dialog.getByText("Preferências iniciais")).toBeTruthy();
    expect(dialog.getByText("Clicou no WhatsApp")).toBeTruthy();
    expect(dialog.getByText(/O contato com a equipe não é confirmado pelo site/)).toBeTruthy();
    await user.click(dialog.getByRole("radio", { name: "Envios" }));
    expect(dialog.queryByText("Clicou no WhatsApp")).toBeNull();
    expect(dialog.getByText("Quero comprar uma casa de 3 quartos até 650 mil.")).toBeTruthy();
    expect(p.detail.refetch).not.toHaveBeenCalled();
  });

  it("supports an opened session without conversation and a recoverable detail error", async () => {
    const p = props();
    const detail = detailFixture(conversationFixture("cordial", 2));
    const { rerender } = render(
      <PublicBotInsightsView
        {...p}
        brand="cordial"
        conversationId={detail.id}
        detail={query(detail)}
      />,
    );
    expect(
      screen.getByText("O bot foi aberto, mas ainda não há perguntas ou cliques registrados."),
    ).toBeTruthy();
    const failed = { ...query(detail), isError: true };
    rerender(
      <PublicBotInsightsView {...p} brand="cordial" conversationId={detail.id} detail={failed} />,
    );
    expect(screen.getByText("Não foi possível carregar esta sessão.")).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Tentar novamente" }),
    );
    expect(failed.refetch).toHaveBeenCalledOnce();
    expect(within(screen.getByRole("dialog")).queryByText("Preferências iniciais")).toBeNull();
  });

  it("shows an unavailable session when the successful detail request returns null", () => {
    const p = props();
    render(
      <PublicBotInsightsView
        {...p}
        brand="cordial"
        conversationId={conversationFixture().id}
        detail={query(null)}
      />,
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/Esta sessão não está mais disponível/)).toBeTruthy();
    expect(dialog.queryByText("Carregando a sessão…")).toBeNull();
  });
});
