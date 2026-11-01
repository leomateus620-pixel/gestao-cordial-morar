import assert from "node:assert/strict";
import test from "node:test";
import { aiEditSize, resultFileName, suggestSelection, suggestedCount, validateFile } from "./model";

test("simulação de 25% arredonda para cima", () => {
  assert.equal(suggestedCount(4), 1);
  assert.equal(suggestedCount(10), 3);
  assert.equal(suggestedCount(15), 4);
  assert.equal(suggestedCount(20), 5);
  assert.equal(suggestedCount(30), 8);
  assert.equal(suggestedCount(0), 0);
});

test("sugestão escolhe exatamente a quantidade, sem repetir", () => {
  const ids = Array.from({ length: 20 }, (_, i) => i);
  assert.equal(suggestSelection(ids).size, 5);
  assert.equal(suggestSelection(ids.slice(0, 10)).size, 3);
});

test("nome do arquivo realçado", () => {
  assert.equal(resultFileName("Sala Estar.HEIC"), "Sala-Estar-realce.jpg");
});

test("tamanho pedido à IA mantém a proporção e múltiplos de 16", () => {
  const h = aiEditSize(4032, 3024);
  assert.equal(h.width, 2048);
  assert.equal(h.height, 1536);
  const v = aiEditSize(3024, 4032);
  assert.equal(v.width, 1536);
  assert.equal(v.height, 2048);
  assert.equal(v.width % 16, 0);
});

test("formatos e tamanho", () => {
  assert.equal(validateFile({ name: "a.heic", type: "", size: 10 }), null);
  assert.ok(validateFile({ name: "a.gif", type: "image/gif", size: 10 }));
  assert.ok(validateFile({ name: "a.jpg", type: "image/jpeg", size: 41 * 1024 * 1024 }));
});
