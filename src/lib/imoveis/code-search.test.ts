import assert from "node:assert/strict";
import test from "node:test";
import {
  codeColumnsFor,
  codeSearchLabel,
  normalizePropertyCode,
  otherBrandFor,
} from "./code-search.ts";

test("normaliza códigos digitados", () => {
  assert.equal(normalizePropertyCode(" 1442 "), "1442");
  assert.equal(normalizePropertyCode("#1442"), "1442");
  assert.equal(normalizePropertyCode("# 1442"), "1442");
  assert.equal(normalizePropertyCode("01442"), "1442");
  assert.equal(normalizePropertyCode("14 42"), "1442");
});

test("rejeita códigos inválidos", () => {
  assert.equal(normalizePropertyCode("14a2"), null);
  assert.equal(normalizePropertyCode(""), null);
  assert.equal(normalizePropertyCode("#"), null);
  assert.equal(normalizePropertyCode("0"), null);
  assert.equal(normalizePropertyCode("000"), null);
  assert.equal(normalizePropertyCode("123456789"), null);
  assert.equal(normalizePropertyCode("12345678"), "12345678");
  assert.equal(normalizePropertyCode("1.442"), null);
  assert.equal(normalizePropertyCode(1442), null);
});

test("escolhe as colunas pela marca, nunca o legado", () => {
  assert.deepEqual(codeColumnsFor("cordial"), ["codigo_cordial"]);
  assert.deepEqual(codeColumnsFor("morar"), ["codigo_morar"]);
  assert.deepEqual(codeColumnsFor("todas"), ["codigo_cordial", "codigo_morar"]);
  assert.deepEqual(codeColumnsFor("ambas"), ["codigo_cordial", "codigo_morar"]);
});

test("outra marca e rótulos", () => {
  assert.equal(otherBrandFor("cordial"), "morar");
  assert.equal(otherBrandFor("morar"), "cordial");
  assert.equal(otherBrandFor("todas"), null);
  assert.equal(codeSearchLabel("1442", "morar"), "código Morar 1442");
  assert.equal(codeSearchLabel("1442", "todas"), "código 1442");
});
