import { test } from "node:test";
import assert from "node:assert/strict";
import { diffCharacteristics, nextConfirmedSet, verifyFields } from "./characteristics-diff";
import { sameValue } from "./payload-diff";

test("insere as novas, mantém as existentes e remove as retiradas", () => {
  const diff = diffCharacteristics(["10", "20", "30"], ["20", "30", "40"]);
  assert.deepEqual(diff.toInsert, ["40"]);
  assert.deepEqual(diff.toRemove, ["10"]);
  assert.deepEqual(diff.toKeep, ["20", "30"]);
});

test("primeira sincronização só insere", () => {
  const diff = diffCharacteristics(null, ["7", "7", " 8 "]);
  assert.deepEqual(diff.toInsert, ["7", "8"]);
  assert.deepEqual(diff.toRemove, []);
});

test("conjunto vazio no imóvel remove apenas o que o Gestão associou", () => {
  const diff = diffCharacteristics(["5"], []);
  assert.deepEqual(diff.toRemove, ["5"]);
  assert.deepEqual(diff.toInsert, []);
});

test("remoção que falhou continua no conjunto confirmado", () => {
  const next = nextConfirmedSet(["10", "20"], [], ["20"]);
  assert.deepEqual(next, ["10"]);
  const incomplete = nextConfirmedSet(["10", "20"], [], []);
  assert.deepEqual(incomplete, ["10", "20"]);
});

test("campo confirmado, divergente e não verificável", () => {
  const verification = verifyFields(
    { valorImovel: "195000", localChave: "Recepção", seoTitulo: "Terreno" },
    { valorImovel: "195.000", localChave: "Portaria" },
    sameValue,
  );
  assert.deepEqual(verification.confirmed, ["valorImovel"]);
  assert.deepEqual(verification.divergent, ["localChave"]);
  assert.deepEqual(verification.unverifiable, ["seoTitulo"]);
});

test("resposta remota vazia não confirma nada", () => {
  const verification = verifyFields({ valorImovel: "1" }, {}, sameValue);
  assert.deepEqual(verification.confirmed, []);
  assert.deepEqual(verification.unverifiable, ["valorImovel"]);
});
