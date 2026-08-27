import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  activeChips,
  countActiveAdvanced,
  parseCatalogSearch,
  serializeCatalogSearch,
  toListInput,
} from "./filters";

describe("filtros do catálogo de imóveis", () => {
  it("ignora valores inválidos vindos da URL", () => {
    const parsed = parseCatalogSearch({
      carteira: "invalida",
      operacao: 42,
      valorMin: "abc",
      page: -5,
      sort: "aleatorio",
    });
    expect(parsed.carteira).toBe("todas");
    expect(parsed.operacao).toBe("todos");
    expect(parsed.valorMin).toBeNull();
    expect(parsed.page).toBe(0);
    expect(parsed.sort).toBe("recentes");
  });

  it("mantém apenas o que difere do padrão na URL", () => {
    expect(serializeCatalogSearch(DEFAULT_FILTERS)).toEqual({});
    expect(
      serializeCatalogSearch({ ...DEFAULT_FILTERS, q: "praia", dormitoriosMin: 3, page: 2 }),
    ).toEqual({ q: "praia", dormitoriosMin: 3, page: 2 });
  });

  it("converte para a entrada da listagem sem strings vazias", () => {
    const input = toListInput({ ...DEFAULT_FILTERS, q: "  1024  ", cidade: "" }, 24);
    expect(input.search).toBe("1024");
    expect(input.cidade).toBeNull();
    expect(input.pageSize).toBe(24);
  });

  it("resume os filtros ativos em etiquetas removíveis", () => {
    const chips = activeChips({ ...DEFAULT_FILTERS, operacao: "venda", vagasMin: 2 });
    expect(chips.map((c) => c.key)).toEqual(["operacao", "vagasMin"]);
    expect(countActiveAdvanced({ ...DEFAULT_FILTERS, operacao: "venda", vagasMin: 2 })).toBe(1);
  });
});
