import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFact, InvalidFactError, FACT_TEXT_MAX_LENGTH } from "./facts.server.ts";

test("masks personal data in the fact text", () => {
  const out = normalizeFact({ tipo: "preferencia", texto: "Ligar em 11 99999-1234 ou ana@example.com" });
  assert.doesNotMatch(out.texto, /99999-1234|ana@example\.com/);
});

test("rejects facts about the property owner in tipo or texto", () => {
  assert.throws(() => normalizeFact({ tipo: "proprietario_contato", texto: "ok" }), InvalidFactError);
  assert.throws(
    () => normalizeFact({ tipo: "nota", texto: "Dados do proprietário: fulano" }),
    InvalidFactError,
  );
});

test("truncates overly long text to the max length", () => {
  const out = normalizeFact({ tipo: "nota", texto: "a".repeat(400) });
  assert.equal(out.texto.length, FACT_TEXT_MAX_LENGTH);
});

test("normalizes optional ref id and expiration", () => {
  const out = normalizeFact({
    tipo: "nota",
    texto: "ok",
    refId: "  abc  ",
    expiresAt: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(out.refId, "abc");
  assert.equal(out.expiresAt, "2030-01-01T00:00:00.000Z");
});

test("rejects an invalid expiration date", () => {
  assert.throws(
    () => normalizeFact({ tipo: "nota", texto: "ok", expiresAt: "not-a-date" }),
    InvalidFactError,
  );
});
