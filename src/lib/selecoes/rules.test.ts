import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addUnique,
  buildClientWhatsappText,
  dedupe,
  moveId,
  normalizeWhatsapp,
  selectionStatus,
  suggestTitle,
  toggleId,
  whatsappUrl,
} from "./rules";

test("seleção não duplica imóvel e mantém ordem", () => {
  let ids: string[] = [];
  ids = addUnique(ids, "a");
  ids = addUnique(ids, "b");
  ids = addUnique(ids, "a");
  assert.deepEqual(ids, ["a", "b"]);
  assert.deepEqual(toggleId(ids, "a"), ["b"]);
  assert.deepEqual(dedupe(["x", "y", "x"]), ["x", "y"]);
});

test("reordenar move uma posição e respeita limites", () => {
  assert.deepEqual(moveId(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(moveId(["a", "b"], "a", -1), ["a", "b"]);
});

test("título sugerido a partir da pesquisa", () => {
  assert.equal(
    suggestTitle({ tipo: "Casa", cidade: "Santa Rosa", valorMax: 450000 }),
    "Casas em Santa Rosa até R$ 450 mil",
  );
  assert.equal(suggestTitle({}), "Imóveis selecionados para você");
});

test("texto do WhatsApp com referências e limite", () => {
  const text = buildClientWhatsappText({
    title: "Casas",
    link: "https://x/s/abc",
    favoriteRefs: Array.from({ length: 18 }, (_, i) => String(i + 1)),
  });
  assert.match(text, /Ref\. 1\n/);
  assert.match(text, /e mais 3 opções/);
  assert.match(text, /https:\/\/x\/s\/abc$/);
  const none = buildClientWhatsappText({ title: "Casas", link: "L", favoriteRefs: [] });
  assert.match(none, /conversar sobre as opções/);
});

test("link do WhatsApp só abre conversa com texto", () => {
  assert.equal(normalizeWhatsapp("(55) 99999-1234"), "5555999991234");
  const url = whatsappUrl("55999991234", "Olá");
  assert.equal(url, "https://wa.me/5555999991234?text=Ol%C3%A1");
});

test("situação considera encerramento e validade", () => {
  assert.equal(selectionStatus({ status: "encerrada", expires_at: null }), "encerrada");
  assert.equal(selectionStatus({ status: "ativa", expires_at: "2000-01-01T00:00:00Z" }), "expirada");
  assert.equal(selectionStatus({ status: "ativa", expires_at: null }), "ativa");
});

import { canChooseResponsible, resolveResponsible, visibleSelections } from "./rules";

test("só admin e secretária escolhem o responsável (papéis acumulados contam)", () => {
  assert.equal(canChooseResponsible(["admin"]), true);
  assert.equal(canChooseResponsible(["secretaria"]), true);
  assert.equal(canChooseResponsible(["secretaria", "corretor"]), true);
  assert.equal(canChooseResponsible(["corretor"]), false);
  assert.equal(canChooseResponsible(["financeiro"]), false);
});

test("corretor não atribui a outro; gestora sim", () => {
  assert.deepEqual(resolveResponsible({ uid: "c1", roles: ["corretor"], requested: "c2" }), { ok: false, error: "responsavel_nao_permitido" });
  assert.deepEqual(resolveResponsible({ uid: "c1", roles: ["corretor"] }), { ok: true, id: "c1" });
  assert.deepEqual(resolveResponsible({ uid: "c1", roles: ["corretor"], current: "c3" }), { ok: true, id: "c3" });
  assert.deepEqual(resolveResponsible({ uid: "s1", roles: ["secretaria", "corretor"], requested: "c2" }), { ok: true, id: "c2" });
});

test("listagem por papel", () => {
  const rows = [
    { id: "a", owner_id: "c1", corretor_id: "c1" },
    { id: "b", owner_id: "s1", corretor_id: "c1" },
    { id: "c", owner_id: "s1", corretor_id: "c2" },
  ];
  assert.deepEqual(visibleSelections(rows, "c1", ["corretor"]).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(visibleSelections(rows, "s1", ["secretaria"]).map((r) => r.id), ["a", "b", "c"]);
});
