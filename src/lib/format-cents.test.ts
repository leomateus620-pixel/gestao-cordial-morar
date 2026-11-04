import assert from "node:assert/strict";
import test from "node:test";
import { brlCents, parseBrlInput, formatBrlInput } from "./format.ts";

const n = (s: string) => s.replace(/\s/g, " ");
test("recibo mostra centavos", () => {
  assert.equal(n(brlCents(919.44)), "R$ 919,44");
  assert.equal(n(brlCents(0)), "R$ 0,00");
});
test("entrada em reais aceita formato brasileiro", () => {
  assert.equal(parseBrlInput("1.234,56"), 1234.56);
  assert.equal(parseBrlInput("919,44"), 919.44);
  assert.ok(Number.isNaN(parseBrlInput("abc")));
  assert.equal(formatBrlInput(0), "0,00");
});
