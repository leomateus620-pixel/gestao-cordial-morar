import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCHEDULE as S, activateAt, chooseCandidate, liveWeek, mondayOf, planWorker, prepareAt, canRegenerate, type Candidate } from "../../src/lib/cordial-site/showcase";

const c = (id: string, w: number, h: number, at: string): Candidate => ({ propertyId: id, publicId: id, mediaId: id, mediaVersion: "a".repeat(32), width: w, height: h, publishedAt: at });

test("troca às 06h de segunda em São Paulo (09h UTC)", () => {
  assert.equal(activateAt("2026-11-09", S).toISOString(), "2026-11-09T09:00:00.000Z");
  assert.equal(liveWeek(new Date("2026-11-09T08:59:00Z"), S), "2026-11-02");
  assert.equal(liveWeek(new Date("2026-11-09T09:00:00Z"), S), "2026-11-09");
});

test("preparo no domingo às 18h de São Paulo, véspera da troca", () => {
  assert.equal(prepareAt("2026-11-09", S).toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(mondayOf(new Date("2026-11-08T21:00:00Z")), "2026-11-02");
});

test("escolhe imóvel horizontal mais recente que não apareceu nas últimas semanas", () => {
  const list = [c("a", 1600, 1000, "2026-11-01"), c("b", 900, 1600, "2026-11-03"), c("d", 1600, 1000, "2026-10-01")];
  assert.equal(chooseCandidate(list, [])?.propertyId, "a");
  assert.equal(chooseCandidate(list, ["a"])?.propertyId, "d");
  assert.equal(chooseCandidate([c("b", 900, 1600, "x")], []), null);
});

test("sem aprovação, a semana entra no ar com a foto original", () => {
  const now = new Date("2026-11-09T09:30:00Z");
  const a = planWorker(now, S, [{ id: "w", week_start: "2026-11-09", state: "aguardando_revisao", approved_at: null, use_original: true }], false);
  assert.deepEqual(a[0], { kind: "activate", weekId: "w", withOriginal: true });
});

test("não duplica: semana ativa e próxima já preparada não geram nada", () => {
  const now = new Date("2026-11-15T22:00:00Z"); // domingo 19h SP
  const rows = [
    { id: "1", week_start: "2026-11-09", state: "ativo" as const, approved_at: null, use_original: true },
    { id: "2", week_start: "2026-11-16", state: "aguardando_revisao" as const, approved_at: null, use_original: true },
  ];
  assert.deepEqual(planWorker(now, S, rows, false), []);
});

test("caso incerto nunca é regerado sozinho e pausa bloqueia tudo", () => {
  const now = new Date("2026-11-15T22:00:00Z");
  const rows = [
    { id: "1", week_start: "2026-11-09", state: "ativo" as const, approved_at: null, use_original: true },
    { id: "2", week_start: "2026-11-16", state: "incerto" as const, approved_at: null, use_original: true },
  ];
  assert.deepEqual(planWorker(now, S, rows, false), []);
  assert.deepEqual(planWorker(now, S, [], true), []);
});

test("imóvel retirado (substituído) faz a rotina escolher outro para a semana", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const a = planWorker(now, S, [{ id: "1", week_start: "2026-11-09", state: "substituido", approved_at: null, use_original: true }], false);
  assert.deepEqual(a[0], { kind: "create-and-activate", week: "2026-11-09" });
});

test("pedido de nova edição é bloqueado durante a geração", () => {
  assert.equal(canRegenerate("gerando"), false);
  assert.equal(canRegenerate("aguardando_revisao"), true);
});
