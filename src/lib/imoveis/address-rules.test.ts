import { test } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeComplement,
  mergeComplemento,
  suggestAddressSplit,
  validateAddressNumber,
} from "./address-rules";

const cases: Array<[string, string, string]> = [
  ["355,Bl-1/Apt: 201", "355", "Bl-1/Apt: 201"],
  ["380 bloco 2 406", "380", "bloco 2 406"],
  ["1146    -  102", "1146", "102"],
  ["494/Apt:1002", "494", "Apt:1002"],
  ["185  ap 302", "185", "ap 302"],
  ["1356 fundos", "1356", "fundos"],
  ["S/N fundos", "S/N", "fundos"],
];

test("separa número e complemento dos casos reais", () => {
  for (const [input, numero, complemento] of cases) {
    assert.deepEqual(suggestAddressSplit(input), { numero, complemento }, input);
  }
});

test("sem nada para mover devolve null", () => {
  for (const v of ["S/N", "SEM", "1234A", "355", "", null, undefined, "Rua X"]) {
    assert.equal(suggestAddressSplit(v), null, String(v));
  }
});

test("limite de 15 caracteres", () => {
  assert.equal(validateAddressNumber("123456789012345").ok, true);
  const r = validateAddressNumber("1234567890123456");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /16 caracteres/);
  assert.equal(validateAddressNumber("355,Bl-1/Apt: 201").ok, false);
  assert.equal(validateAddressNumber(null).ok, true);
  assert.equal(validateAddressNumber("").ok, true);
});

test("detecta complemento sem bloquear", () => {
  assert.equal(looksLikeComplement("185  ap 302"), true);
  assert.equal(looksLikeComplement("1356 fundos"), true);
  assert.equal(looksLikeComplement("355"), false);
  assert.equal(looksLikeComplement("S/N"), false);
});

test("mescla complemento existente", () => {
  assert.equal(mergeComplemento("Bl-1", null), "Bl-1");
  assert.equal(mergeComplemento("Bl-1", "Bl-1 fundos"), "Bl-1 fundos");
  assert.equal(mergeComplemento("Apt 201", "Cond. Sol"), "Apt 201, Cond. Sol");
});
