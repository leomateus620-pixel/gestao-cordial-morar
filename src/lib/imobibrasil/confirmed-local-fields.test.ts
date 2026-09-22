import { strict as assert } from "node:assert";
import { test } from "node:test";
import { confirmedLocalFieldsAfterSend } from "./confirm-snapshot";

test("partial update advances only fields proved by the remote read", () => {
  const snapshot = confirmedLocalFieldsAfterSend({
    mode: "update",
    base: { valor: 100, bairro: "Antigo" },
    local: { valor: 200, bairro: "Novo" },
    observed: { valor: 200, bairro: "Antigo" },
    confirmedPayloadKeys: ["valorImovel"],
    changedPayloadKeys: ["valorImovel", "bairro"],
  });
  assert.deepEqual(snapshot, { valor: 200, bairro: "Antigo" });
});

test("remote-only change is not absorbed into the send baseline", () => {
  const snapshot = confirmedLocalFieldsAfterSend({
    mode: "update",
    base: { valor: 100, bairro: "Antigo" },
    local: { valor: 200, bairro: "Antigo" },
    observed: { valor: 200, bairro: "Mudou no site" },
    confirmedPayloadKeys: ["valorImovel", "bairro"],
    changedPayloadKeys: ["valorImovel"],
  });
  assert.deepEqual(snapshot, { valor: 200, bairro: "Antigo" });
});

test("new publication establishes baseline only for equal, confirmed values", () => {
  const snapshot = confirmedLocalFieldsAfterSend({
    mode: "insert",
    base: null,
    local: { valor: 200, bairro: "Centro" },
    observed: { valor: 200, bairro: "Outro" },
    confirmedPayloadKeys: ["valorImovel", "bairro"],
    changedPayloadKeys: ["valorImovel", "bairro"],
  });
  assert.deepEqual(snapshot, { valor: 200 });
});

test("new publication establishes a baseline for other fields proved by the read", () => {
  const snapshot = confirmedLocalFieldsAfterSend({
    mode: "insert",
    base: null,
    local: { acomodacoes: 4, observacao: "Local" },
    observed: { acomodacoes: 4, observacao: "Outra" },
    confirmedPayloadKeys: [],
    changedPayloadKeys: [],
  });
  assert.deepEqual(snapshot, { acomodacoes: 4 });
});
