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
test("ponto de milhar só é interpretado com campo ou marcador conhecido", () => {
  assert.equal(parseKnownNumber("1.500"), null);
  assert.equal(parseKnownNumber("1.500", "valor"), 1500);
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

test("área e medidas não são arredondadas para centavos", () => {
  assert.equal(sameValue(1.001, 1.004, "areaTotal"), false);
  assert.equal(sameValue(1.001, 1.001, "areaTotal"), true);
});

test("dinheiro compara em centavos", () => {
  assert.equal(sameValue("1.500,50", 1500.5, "valor"), true);
  assert.equal(sameValue(1500.504, 1500.5, "valor"), true);
});

test("'1.234' ambíguo não confirma área de 1,234 nem 1234", () => {
  assert.equal(sameValue("1.234", 1.234, "areaTotal"), false);
  assert.equal(sameValue("1.234", 1234, "areaTotal"), false);
  assert.equal(sameValue("1.234", 1234, "valor"), true);
  assert.equal(sameValue("1.234", 1.234, "valor"), false);
});

test("código é texto: zero à esquerda e formato importam", () => {
  assert.equal(sameValue("0123", "123", "codigoProprietario"), false);
  assert.equal(sameValue("R1", "r1", "referencia"), true);
});
