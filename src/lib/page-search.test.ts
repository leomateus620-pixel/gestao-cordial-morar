import assert from "node:assert/strict";
import test from "node:test";
import { getHeaderSearchMode } from "./page-search.ts";
import { roleDefinitions } from "./mock/permissions.ts";

test("corretores can search the mounted Atendimentos page without global search access", () => {
  const { modules } = roleDefinitions.corretor;
  assert.equal(modules.includes("atendimentos"), true);
  assert.equal(modules.includes("busca"), false);
  assert.equal(getHeaderSearchMode(modules, true), "page");
  assert.equal(getHeaderSearchMode(modules, false), null);
});

test("secretarias can search the mounted Atendimentos page without global search access", () => {
  const { modules } = roleDefinitions.secretaria;
  assert.equal(modules.includes("atendimentos"), true);
  assert.equal(modules.includes("busca"), false);
  assert.equal(getHeaderSearchMode(modules, true), "page");
  assert.equal(getHeaderSearchMode(modules, false), null);
});

test("admin search returns to global only after leaving the page search", () => {
  const { modules } = roleDefinitions.admin_owner;
  assert.equal(getHeaderSearchMode(modules, true), "page");
  assert.equal(getHeaderSearchMode(modules, false), "global");
});

test("no registered page and no busca module never grants global search", () => {
  assert.equal(getHeaderSearchMode(roleDefinitions.meta_reviewer.modules, false), null);
  assert.equal(getHeaderSearchMode([], false), null);
});