import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FILTERS,
  activeChips,
  countActiveAdvanced,
  countActiveFilters,
  parseCatalogSearch,
  priceRangeLabel,
  serializeCatalogSearch,
  shortBRL,
  toListInput,
} from "./filters.ts";

test("ignora valores inválidos vindos da URL", () => {
  const parsed = parseCatalogSearch({
    carteira: "invalida",
    operacao: 42,
    valorMin: "abc",
    page: -5,
    sort: "aleatorio",
  });
  assert.equal(parsed.carteira, "todas");
  assert.equal(parsed.operacao, "todos");
  assert.equal(parsed.valorMin, null);
  assert.equal(parsed.page, 0);
  assert.equal(parsed.sort, "recentes");
});

test("mantém apenas o que difere do padrão na URL", () => {
  assert.deepEqual(serializeCatalogSearch(DEFAULT_FILTERS), {});
  assert.deepEqual(
    serializeCatalogSearch({ ...DEFAULT_FILTERS, q: "praia", dormitoriosMin: 3, page: 2 }),
    { q: "praia", dormitoriosMin: 3, page: 2 },
  );
});

test("converte para a entrada da listagem sem strings vazias", () => {
  const input = toListInput({ ...DEFAULT_FILTERS, q: "  1024  ", cidade: "" }, 24);
  assert.equal(input.search, "1024");
  assert.equal(input.cidade, null);
  assert.equal(input.pageSize, 24);
});

test("resume os filtros ativos em etiquetas removíveis", () => {
  const chips = activeChips({ ...DEFAULT_FILTERS, operacao: "venda", vagasMin: 2 });
  assert.deepEqual(
    chips.map((c) => c.key),
    ["operacao", "vagasMin"],
  );
  assert.equal(countActiveAdvanced({ ...DEFAULT_FILTERS, operacao: "venda", vagasMin: 2 }), 1);
});

test("conta todos os filtros ativos ignorando busca, carteira e ordenação", () => {
  assert.equal(countActiveFilters(DEFAULT_FILTERS), 0);
  assert.equal(
    countActiveFilters({
      ...DEFAULT_FILTERS,
      q: "praia",
      carteira: "cordial",
      sort: "preco_asc",
      page: 3,
      operacao: "aluguel",
      cidade: "Santa Rosa",
      valorMax: 500_000,
      arquivados: "somente",
    }),
    4,
  );
});

test("formata valores curtos e a faixa de preço para os chips", () => {
  assert.equal(shortBRL(1_500), "R$ 1,5 mil");
  assert.equal(shortBRL(350_000), "R$ 350 mil");
  assert.equal(shortBRL(1_200_000), "R$ 1,2 mi");
  assert.equal(priceRangeLabel(null, null), null);
  assert.equal(priceRangeLabel(200_000, 350_000), "R$ 200 mil – R$ 350 mil");
  assert.equal(priceRangeLabel(1_000_000, null), "A partir de R$ 1 mi");
  assert.equal(priceRangeLabel(null, 200_000), "Até R$ 200 mil");
});

test("chips usam rótulos legíveis para status e valor", () => {
  const chips = activeChips({ ...DEFAULT_FILTERS, status: "out_of_sync", valorMin: 800_000 });
  assert.deepEqual(
    chips.map((c) => c.label),
    ["Status: Divergente", "A partir de R$ 800 mil"],
  );
});
