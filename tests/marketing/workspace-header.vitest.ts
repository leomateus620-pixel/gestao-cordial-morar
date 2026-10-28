import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingSearchSchema } from "../../src/lib/marketing/query-state";
import { useApp } from "../../src/store/app-store";

const route = vi.hoisted(() => ({ search: {}, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { search: route.search } }),
  useNavigate: () => route.navigate,
}));
import {
  MarketingHeaderAgencyControl,
  MarketingHeaderSearchInput,
} from "../../src/components/marketing/MarketingHeaderControls";

afterEach(() => {
  route.search = {};
  route.navigate.mockClear();
});

describe("Marketing uses the existing shell control slots", () => {
  it.each(["overview", "campaigns", "reports"])(
    "shows the campaign query and clear action in the superior search for %s",
    (area) => {
      const query = marketingSearchSchema.parse({
        area,
        search: "Imóveis no Centro",
        leadSearch: "Contato preservado",
      });
      const $ = load(
        renderToStaticMarkup(
          createElement(MarketingHeaderSearchInput, { query, onQueryChange: vi.fn() }),
        ),
      );
      expect($("input")).toHaveLength(1);
      expect($("input").attr("value")).toBe("Imóveis no Centro");
      expect($("input").attr("aria-label")).toBe("Buscar campanha no Marketing");
      expect($("button").attr("aria-label")).toBe("Limpar busca de campanhas");
      expect(route.navigate).not.toHaveBeenCalled();
    },
  );

  it("switches the superior search to contacts in Leads without showing the saved campaign query", () => {
    const query = marketingSearchSchema.parse({
      area: "leads",
      search: "Campanha preservada",
      leadSearch: "Contato do período",
    });
    const $ = load(
      renderToStaticMarkup(
        createElement(MarketingHeaderSearchInput, { query, onQueryChange: vi.fn() }),
      ),
    );
    expect($("input").attr("value")).toBe("Contato do período");
    expect($("input").attr("aria-label")).toBe("Buscar contato no Marketing");
    expect($("button").attr("aria-label")).toBe("Limpar busca de contatos");
    expect($.text()).not.toContain("Campanha preservada");
  });

  it("reads restored route context in production mode without a second local search", () => {
    route.search = { area: "leads", leadSearch: "Busca da URL", search: "Outra área" };
    const $ = load(renderToStaticMarkup(createElement(MarketingHeaderSearchInput)));
    expect($("input")).toHaveLength(1);
    expect($("input").attr("value")).toBe("Busca da URL");
    expect($("input").attr("aria-label")).toBe("Buscar contato no Marketing");
  });

  it("keeps the global agency control selected from the Marketing URL", () => {
    const query = marketingSearchSchema.parse({ agency: "morar" });
    const $ = load(
      renderToStaticMarkup(
        createElement(MarketingHeaderAgencyControl, { query, onQueryChange: vi.fn() }),
      ),
    );
    expect($("button")).toHaveLength(3);
    expect($("button[aria-pressed=true]").text()).toBe("Morar");
    expect(
      $("button")
        .map((_index, button) => $(button).text())
        .get(),
    ).toEqual(["Todas", "Cordial", "Morar"]);
  });

  it("uses the persisted global agency when the Marketing URL has no override", () => {
    const query = marketingSearchSchema.parse({});
    const $ = load(
      renderToStaticMarkup(
        createElement(MarketingHeaderAgencyControl, { query, onQueryChange: vi.fn() }),
      ),
    );
    const labels = { todas: "Todas", cordial: "Cordial", morar: "Morar" };
    expect($("button[aria-pressed=true]").text()).toBe(labels[useApp.getState().agency]);
    expect(route.navigate).not.toHaveBeenCalled();
  });
});
