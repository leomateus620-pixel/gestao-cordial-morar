import { strict as assert } from "node:assert";
import test from "node:test";
import { nextListStep } from "./list-plan";
import { fetchAllPropertyPagesWith } from "./list-all";

test("depois da última página de ativos vem a primeira de inativos", () => {
  assert.deepEqual(nextListStep({ status: "ativo", page: 3, totalPages: 3 }), {
    kind: "page", status: "inativo", page: 1, key: "inativo:page:1",
  });
});

test("só finaliza depois dos inativos", () => {
  assert.equal(nextListStep({ status: "inativo", page: 2, totalPages: 2 }).kind, "finalize");
  assert.equal(nextListStep({ status: "inativo", page: 1, totalPages: 2 }).kind, "page");
});

test("paginação interrompida não é leitura confiável", async () => {
  const result = await fetchAllPropertyPagesWith(async (page) => {
    if (page === 2) throw new Error("timeout");
    return { items: [{ codigo: "1" }], page, perPage: 1, totalPages: 3, totalItems: 3 };
  }, 1);
  assert.equal(result.reliable, false);
  assert.equal(result.reason, "falha_consulta");
  assert.equal(result.items.length, 1);
});

test("lista vazia válida é confiável", async () => {
  const result = await fetchAllPropertyPagesWith(async (page) => ({
    items: [], page, perPage: 50, totalPages: 1, totalItems: 0,
  }), 50);
  assert.equal(result.reliable, true);
  assert.equal(result.items.length, 0);
});

import { extractPage } from "./read-parsers";

test("formato desconhecido não vira lista vazia confiável", async () => {
  const page = extractPage({ unexpected: "response" }, 1, 50);
  assert.equal(page.recognized, false);
  const result = await fetchAllPropertyPagesWith(async () => page, 50);
  assert.equal(result.reliable, false);
  assert.equal(result.reason, "formato_desconhecido");
});

test("array cheio sem metadados não encerra a leitura na 1ª página", async () => {
  const full = Array.from({ length: 50 }, (_, i) => ({ codigo: i }));
  const pages = [full, full.slice(0, 3)];
  const result = await fetchAllPropertyPagesWith(async (n) => extractPage(pages[n - 1], n, 50), 50);
  assert.equal(result.reliable, true);
  assert.equal(result.pagesRead, 2);
  assert.equal(result.items.length, 53);
});
