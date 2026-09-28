import assert from "node:assert/strict";
import test from "node:test";
import {
  isOnlyStaleHistory,
  nationalPhone,
  openOwnedMatch,
  phoneKey,
  rankMatches,
  type ContactMatch,
} from "./duplicate-detection.ts";

test("phone normalization handles 55 / 11 / 10 / 8 digits", () => {
  assert.equal(nationalPhone("+55 (55) 98434-3050"), "55984343050");
  assert.equal(nationalPhone("(55) 98434-3050"), "55984343050");
  assert.equal(nationalPhone("55 3512-3456"), "5535123456");
  assert.equal(phoneKey("+55 (55) 98434-3050"), "84343050");
  assert.equal(phoneKey("(55) 98434-3050"), "84343050");
  assert.equal(phoneKey("8434-3050"), "84343050");
  assert.equal(phoneKey("1234"), null);
});

const base: ContactMatch = {
  source: "attendance", id: "x", clienteNome: "Maria", telefone: "", email: null,
  corretorId: null, corretorNome: null, status: "novo", pipelineStage: "primeiro_contato",
  imobiliaria: "cordial", createdAt: "2026-08-28T00:00:00Z", updatedAt: "2026-08-28T00:00:00Z",
};

test("ranking prefers open with broker, then open, closed, client", () => {
  const list: ContactMatch[] = [
    { ...base, id: "c", source: "client", status: null, pipelineStage: null },
    { ...base, id: "closed", status: "perdido", pipelineStage: "perdido" },
    { ...base, id: "open" },
    { ...base, id: "owned", corretorId: "g", corretorNome: "Geandré" },
  ];
  assert.deepEqual(rankMatches(list, 4).map((m) => m.id), ["owned", "open", "closed", "c"]);
  assert.equal(openOwnedMatch(list)?.corretorNome, "Geandré");
});

test("stale closed history is frictionless", () => {
  const old = { ...base, status: "fechado", pipelineStage: "fechamento", updatedAt: "2025-01-01T00:00:00Z" };
  assert.equal(isOnlyStaleHistory([old], Date.parse("2026-09-28")), true);
  assert.equal(isOnlyStaleHistory([base], Date.parse("2026-09-28")), false);
});
