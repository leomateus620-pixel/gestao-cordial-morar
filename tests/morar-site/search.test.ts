import test from "node:test";
import assert from "node:assert/strict";
import { searchDraft } from "../../src/lib/cordial-site/search-state";
import {
  advancedCount,
  advancedDraft,
  mergeAdvanced,
  parseSearchPrice,
  formatSearchPrice,
  morarLocations,
  filterLocations,
} from "../../src/lib/cordial-site/morar-search";

test("advanced snapshots cannot overwrite primary filters, even with an older or excessive payload", () => {
  const before = searchDraft({ finalidade: "venda", cidade: "Santa Rosa", precoMin: 50000 });
  const current = searchDraft({
    finalidade: "aluguel",
    cidade: "Três de Maio",
    precoMin: 500,
    dormitorios: 0,
    contagem: "exata",
  });
  const merged = mergeAdvanced(current, { ...before, ...advancedDraft(before), mobiliado: "sim" });
  for (const key of ["finalidade", "cidade", "precoMin", "dormitorios", "contagem"])
    assert.equal(merged[key], current[key]);
  assert.equal(merged.mobiliado, "sim");
  assert.equal(advancedCount(searchDraft()), 0);
  assert.equal(advancedCount({ ...searchDraft(), exata: "nao" }), 0);
});
test("BRL editing preserves blank, zero, cents and the numeric contract", () => {
  assert.equal(parseSearchPrice(""), "");
  assert.equal(parseSearchPrice("R$ 0"), "0");
  assert.equal(parseSearchPrice("1.234.567,89"), "1234567.89");
  assert.equal(parseSearchPrice("1000.50"), "1000.5");
  assert.equal(parseSearchPrice("1.2"), "1.2");
  assert.equal(formatSearchPrice("1234567.89"), "1.234.567,89");
  for (const text of ["-5", "abc", "1,234", "1e10"])
    assert.equal(parseSearchPrice(text), "invalid");
});
test("location keys are city plus official district and lookup never invents coordinates", () => {
  const options = morarLocations({
    cities: [],
    districts: [
      { city: "Santa Rosa", value: "Centro", count: 1 },
      { city: "Três de Maio", value: "Centro", count: 2 },
    ],
  });
  assert.equal(new Set(options.map((option) => option.key)).size, 4);
  assert.deepEqual(
    filterLocations(options, "tres centro").map((option) => [option.city, option.district]),
    [["Três de Maio", "Centro"]],
  );
  assert.equal(filterLocations(options, "inventado").length, 0);
});
