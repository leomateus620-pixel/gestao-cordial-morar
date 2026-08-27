import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FILTERS,
  activeChips,
  countActiveAdvanced,
  parseCatalogSearch,
  serializeCatalogSearch,
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
