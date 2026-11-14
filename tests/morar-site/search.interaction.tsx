import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act as testingAct,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { MorarSearchForm } from "../../src/components/cordial-site/MorarSearchForm";
import { SiteContext, SiteBrandContext } from "../../src/lib/cordial-site/context";
import { HomeHero, HomePage } from "../../src/components/cordial-site/HomePage";
import type { HomeHeroData } from "../../src/lib/cordial-site/home-loader";
import {
  settingsSchema,
  type PublicProperty,
  type SiteSearch,
} from "../../src/lib/cordial-site/contract";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), count: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
  useRouterState: () => "/",
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/cordial-site/data", () => ({ loadCatalogCount: mocks.count }));

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue({ total: 37 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const facets = {
  types: [
    { value: "Casa", count: 12 },
    { value: "Terreno", count: 25 },
  ],
  cities: [
    { value: "Santa Rosa", count: 20 },
    { value: "Três de Maio", count: 17 },
  ],
  districts: [
    { city: "Santa Rosa", value: "Centro", count: 3 },
    { city: "Três de Maio", value: "Centro", count: 7 },
    { city: "Santa Rosa", value: "Timbaúva", count: 4 },
  ],
  stages: [],
  total: 37,
};
function mount(initial: Partial<SiteSearch> = { finalidade: "venda" }) {
  const user = userEvent.setup();
  const view = render(
    <SiteContext.Provider
      value={{
        facets,
        settings: settingsSchema.parse({}),
        available: true,
        canonicalOrigin: null,
        indexable: false,
      }}
    >
      <div className="cordial-site morar-site">
        <MorarSearchForm compact initial={initial} />
      </div>
    </SiteContext.Provider>,
  );
  return {
    ...view,
    user,
    submit: () => user.click(screen.getByRole("button", { name: "Encontrar meu lugar" })),
  };
}
const lastSearch = () => mocks.navigate.mock.lastCall?.[0]?.search;

describe("Morar direct search", () => {
  it.each([true, false])(
    "streams featured listings independently of the hero (desktop: %s)",
    async (wideViewport) => {
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: wideViewport,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList);
      let resolveHero!: (value: HomeHeroData | null) => void;
      const hero = new Promise<HomeHeroData | null>((done) => {
        resolveHero = done;
      });
      const property = {
        id: "listed-house",
        type: "Casa",
        district: "Centro",
        city: "Santa Rosa",
        operation: "venda",
        price: 100000,
        priceMode: "fixo",
        photoCount: 1,
        areas: {},
        cover: { id: "house-cover", version: "v1" },
      } as PublicProperty;
      const listings = Promise.resolve({ featured: [property], more: [] });
      const leadGallery = Promise.resolve(null);
      const view = await testingAct(async () =>
        render(
          <SiteBrandContext.Provider value="morar">
            <SiteContext.Provider
              value={{
                facets,
                settings: settingsSchema.parse({}),
                available: true,
                canonicalOrigin: null,
                indexable: false,
              }}
            >
              <HomePage hero={hero} listings={listings} leadGallery={leadGallery} />
            </SiteContext.Provider>
          </SiteBrandContext.Provider>,
        ),
      );

      await screen.findByRole("heading", { name: "Imóveis em destaque" });
      expect(screen.getByRole("heading", { name: "Casa" })).toBeTruthy();
      expect(view.container.querySelector(".cs-hx-card-media img:not(noscript img)")).toBeNull();
      expect(view.container.querySelector(".cs-hx-card-media noscript")).not.toBeNull();

      await testingAct(async () => resolveHero(null));
      // Happy DOM cannot fetch the test image; either a live img or its error state
      // proves the cover was attached. The mobile gate remains below the viewport.
      expect(Boolean(view.container.querySelector(".cs-hx-card-media noscript"))).toBe(
        !wideViewport,
      );
    },
  );

  it("keeps filled controls and the advanced draft mounted when the home finishes loading", async () => {
    let resolve!: (value: HomeHeroData | null) => void;
    const hero = new Promise<HomeHeroData | null>((done) => {
      resolve = done;
    });
    const user = userEvent.setup();
    render(
      <SiteBrandContext.Provider value="morar">
        <SiteContext.Provider
          value={{
            facets,
            settings: settingsSchema.parse({}),
            available: true,
            canonicalOrigin: null,
            indexable: false,
          }}
        >
          <HomeHero hero={hero} />
        </SiteContext.Provider>
      </SiteBrandContext.Provider>,
    );
    const min = screen.getByRole("textbox", { name: "Mínimo em reais" });
    await user.type(min, "500.000");
    await user.selectOptions(screen.getByRole("combobox", { name: "Dormitórios" }), "2");
    await user.click(screen.getByRole("button", { name: "Mais filtros" }));
    await user.selectOptions(screen.getByLabelText("Mobiliado"), "sim");
    await act(async () => {
      resolve(null);
    });
    expect(screen.getByRole("dialog", { name: "Mais filtros" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(screen.getByRole("textbox", { name: "Mínimo em reais" })).toBe(min);
    await user.click(screen.getByRole("button", { name: "Encontrar meu lugar" }));
    expect(lastSearch()).toMatchObject({
      finalidade: "venda",
      precoMin: 500000,
      dormitorios: 2,
      mobiliado: "sim",
    });
  });
  it("hydrates the same direct controls and URL values without a server/client mismatch", async () => {
    const ui = (
      <SiteContext.Provider
        value={{
          facets,
          settings: settingsSchema.parse({}),
          available: true,
          canonicalOrigin: null,
          indexable: false,
        }}
      >
        <MorarSearchForm
          compact
          initial={{
            finalidade: "aluguel",
            precoMax: 1500.5,
            cidade: "Santa Rosa",
            bairro: "Centro",
            dormitorios: 2,
            contagem: "exata",
          }}
        />
      </SiteContext.Provider>
    );
    const host = document.createElement("div");
    host.innerHTML = renderToString(ui);
    document.body.append(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    try {
      await act(async () => {
        root = hydrateRoot(host, ui);
      });
      expect(
        (within(host).getByRole("textbox", { name: "Máximo em reais" }) as HTMLInputElement).value,
      ).toBe("1.500,5");
      expect(
        (within(host).getByRole("combobox", { name: "Cidade ou bairro" }) as HTMLInputElement)
          .value,
      ).toBe("Centro · Santa Rosa");
      // Happy DOM's HTML parser keeps a stale select.value for SSR option markup.
      // Check the serialized browser selection here; mounted native values are
      // covered by the interaction cases and the real-browser preview.
      expect(
        within(host)
          .getByRole("combobox", { name: "Dormitórios" })
          .querySelector("option[selected]")
          ?.getAttribute("value"),
      ).toBe("2");
      expect(
        within(host)
          .getByRole("combobox", { name: "Modo de contagem dos espaços" })
          .querySelector("option[selected]")
          ?.getAttribute("value"),
      ).toBe("exata");
      expect(errors.mock.calls.flat().map(String).join(" ")).not.toMatch(/hydrat|mismatch/i);
    } finally {
      await act(async () => root?.unmount());
      host.remove();
      errors.mockRestore();
    }
  });
  it("mounts all four real controls immediately, with no intermediate group buttons or panels", async () => {
    const { user, container, submit } = mount();
    expect(screen.queryByRole("button", { name: "Tipo de imóvel" })).toBeNull();
    expect(container.querySelector(".ms-filter-panel")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Mínimo em reais" })).toBeTruthy();
    for (const name of ["Dormitórios", "Banheiros", "Vagas"])
      expect(screen.getByRole("combobox", { name })).toBeTruthy();
    const type = screen.getByRole("combobox", { name: "Tipo de imóvel" });
    await user.selectOptions(type, "Casa");
    await submit();
    expect(lastSearch()).toMatchObject({ finalidade: "venda", tipo: "Casa", pagina: 1 });
    await user.selectOptions(type, "");
    await submit();
    expect(lastSearch().tipo).toBeUndefined();
  });

  it("selects an accent-insensitive neighborhood atomically and Enter never submits the form", async () => {
    const { user, submit } = mount();
    const location = screen.getByRole("combobox", { name: "Cidade ou bairro" });
    await user.type(location, "timbauva");
    expect(screen.getByRole("option", { name: "Timbaúva · Santa Rosa" })).toBeTruthy();
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((location as HTMLInputElement).value).toBe("Timbaúva · Santa Rosa");
    await submit();
    expect(lastSearch()).toMatchObject({ cidade: "Santa Rosa", bairro: "Timbaúva" });
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("distinguishes same-name districts by city, supports whole cities and clears both coordinates", async () => {
    const { user, submit } = mount();
    const location = screen.getByRole("combobox", { name: "Cidade ou bairro" });
    await user.type(location, "CENTRO");
    await user.click(screen.getByRole("option", { name: "Centro · Três de Maio" }));
    await submit();
    expect(lastSearch()).toMatchObject({ cidade: "Três de Maio", bairro: "Centro" });
    await user.clear(location);
    await user.type(location, "Santa Rosa");
    await user.click(screen.getByRole("option", { name: "Santa Rosa · Todos os bairros" }));
    await submit();
    expect(lastSearch().cidade).toBe("Santa Rosa");
    expect(lastSearch().bairro).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Limpar localização" }));
    await user.keyboard("{Escape}");
    await submit();
    expect(lastSearch().cidade).toBeUndefined();
    expect(lastSearch().bairro).toBeUndefined();
  });

  it("rejects free text as a location and focuses the real combobox", async () => {
    const { user, submit } = mount();
    const location = screen.getByRole("combobox", { name: "Cidade ou bairro" });
    await user.type(location, "Cidade inventada");
    await user.keyboard("{Escape}");
    await submit();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByText(/Selecione uma cidade ou bairro/)).toBeTruthy();
    expect(document.activeElement).toBe(location);
  });
  it("ArrowUp starts at the last official option and Escape closes without applying", async () => {
    const { user } = mount();
    const location = screen.getByRole("combobox", { name: "Cidade ou bairro" });
    await user.click(location);
    const options = screen
      .getAllByRole("option")
      .filter((option) => option.closest('[role="listbox"]'));
    await user.keyboard("{ArrowUp}");
    expect(location.getAttribute("aria-activedescendant")).toBe(options[options.length - 1].id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((location as HTMLInputElement).value).toBe("");
  });

  it("validates price order without swapping and submits BRL as numeric values", async () => {
    const { user, submit } = mount();
    const min = screen.getByRole("textbox", { name: "Mínimo em reais" });
    const max = screen.getByRole("textbox", { name: "Máximo em reais" });
    await user.type(min, "1.000,50");
    await user.type(max, "500");
    await submit();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByText("O máximo deve ser maior ou igual ao mínimo.")).toBeTruthy();
    expect(document.activeElement).toBe(max);
    await user.clear(max);
    await user.type(max, "2.000,75");
    await submit();
    expect(lastSearch()).toMatchObject({ precoMin: 1000.5, precoMax: 2000.75 });
    await user.clear(min);
    await user.clear(max);
    await submit();
    expect(lastSearch().precoMin).toBeUndefined();
    expect(lastSearch().precoMax).toBeUndefined();
  });

  it("preserves URL exact counts, zero and unusual counts, and makes the minimum mode explicit", async () => {
    const { user, submit } = mount({
      finalidade: "aluguel",
      dormitorios: 7,
      banheiros: 0,
      contagem: "exata",
    });
    const rooms = screen.getByRole("combobox", { name: "Dormitórios" });
    expect((rooms as HTMLSelectElement).selectedOptions[0].textContent).toBe("7");
    await submit();
    expect(lastSearch()).toMatchObject({ dormitorios: 7, banheiros: 0, contagem: "exata" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Modo de contagem dos espaços" }),
      "minima",
    );
    await user.selectOptions(rooms, "2");
    expect((rooms as HTMLSelectElement).selectedOptions[0].textContent).toBe("2+");
    await submit();
    expect(lastSearch()).toMatchObject({ dormitorios: 2, contagem: "minima" });
  });

  it("changes purpose by clearing the budget only, and clear filters retains the active purpose", async () => {
    const { user, submit } = mount({
      finalidade: "venda",
      tipo: "Casa",
      cidade: "Santa Rosa",
      bairro: "Centro",
      precoMin: 100000,
      dormitorios: 2,
      contagem: "exata",
    });
    await user.click(screen.getByRole("button", { name: "Quero alugar" }));
    await submit();
    expect(lastSearch()).toMatchObject({
      finalidade: "aluguel",
      tipo: "Casa",
      cidade: "Santa Rosa",
      bairro: "Centro",
      dormitorios: 2,
      contagem: "exata",
    });
    expect(lastSearch().precoMin).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await submit();
    expect(lastSearch().finalidade).toBe("aluguel");
    expect(lastSearch().cidade).toBeUndefined();
    expect(lastSearch().dormitorios).toBeUndefined();
    expect(
      (screen.getByRole("combobox", { name: "Cidade ou bairro" }) as HTMLInputElement).value,
    ).toBe("");
  });

  it("keeps main inputs mounted, portals only advanced fields and discards with Escape and restores focus", async () => {
    const { user } = mount({ finalidade: "aluguel", precoMax: 1500 });
    const max = screen.getByRole("textbox", { name: "Máximo em reais" });
    const trigger = screen.getByRole("button", { name: "Mais filtros" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("morar-site")).toBe(true);
    expect(dialog.closest("form")).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Tipo de imóvel" })).toBeNull();
    expect(within(dialog).queryByRole("textbox", { name: "Máximo em reais" })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText("Mobiliado"), "sim");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("textbox", { name: "Máximo em reais" })).toBe(max);
    expect((max as HTMLInputElement).value).toBe("1.500");
    await user.click(trigger);
    expect((screen.getByLabelText("Mobiliado") as HTMLSelectElement).value).toBe("");
  });

  it("applies only advanced keys into the latest main state, including a change while the dialog is open", async () => {
    const { user, submit } = mount({
      finalidade: "venda",
      tipo: "Casa",
      contagem: "exata",
      dormitorios: 2,
    });
    const purpose = screen.getByRole("button", { name: "Quero alugar" });
    const max = screen.getByRole("textbox", { name: "Máximo em reais" });
    await user.click(screen.getByRole("button", { name: "Mais filtros" }));
    await user.selectOptions(screen.getByLabelText("Mobiliado"), "sim");
    fireEvent.click(purpose);
    fireEvent.change(max, { target: { value: "1.800" } });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await submit();
    expect(lastSearch()).toMatchObject({
      finalidade: "aluguel",
      precoMax: 1800,
      tipo: "Casa",
      dormitorios: 2,
      contagem: "exata",
      mobiliado: "sim",
    });
    expect(screen.getByLabelText("1 filtros avançados ativos")).toBeTruthy();
  });

  it("blocks an invalid advanced area and keeps the advanced draft until corrected", async () => {
    const { user } = mount();
    await user.click(screen.getByRole("button", { name: "Mais filtros" }));
    await user.type(screen.getByLabelText(/Área mínima/), "100");
    await user.type(screen.getByLabelText(/Área máxima/), "50");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/Área máxima/));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("uses the count endpoint and retains the last real total while replacing a request", async () => {
    const { user } = mount();
    await screen.findByText("37 imóveis disponíveis");
    expect(mocks.count.mock.lastCall?.[2]).toBe("morar");
    const firstSignal = mocks.count.mock.lastCall?.[1] as AbortSignal;
    let resolve!: (value: { total: number }) => void;
    mocks.count.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo de imóvel" }), "Casa");
    expect(screen.getByText("37 imóveis disponíveis · atualizando…")).toBeTruthy();
    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    resolve({ total: 12 });
    await screen.findByText("12 imóveis disponíveis");
  });
});
