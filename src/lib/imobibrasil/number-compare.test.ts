import { strict as assert } from "node:assert";
import test from "node:test";
import { parseKnownNumber, sameValue } from "./payload-diff";

test("não confunde 10.5 com 105", () => {
  assert.equal(sameValue(10.5, 105), false);
});
test("aceita vírgula decimal brasileira", () => {
  assert.equal(sameValue(10.5, "10,50"), true);
  assert.equal(sameValue("1.500,00", 1500), true);
});
test("ponto de milhar e ponto decimal", () => {
  assert.equal(parseKnownNumber("1.500"), 1500);
  assert.equal(parseKnownNumber("1500.50"), 1500.5);
  assert.equal(sameValue("R$ 450.000", "450000,00"), true);
});
test("zero é distinto de vazio e nulo", () => {
  assert.equal(sameValue(0, ""), false);
  assert.equal(sameValue(0, null), false);
  assert.equal(sameValue("", null), true);
});
test("identificador com zero à esquerda não vira número", () => {
  assert.equal(sameValue("0123", 123), false);
});
