import assert from "node:assert/strict";
import test from "node:test";
import { matchesRentalSearch } from "./search.ts";
import { getHeaderSearchMode } from "../page-search.ts";
import { roleDefinitions } from "../mock/permissions.ts";

const contract = {
  status: "ativo",
  property: { apelido: "Esquina Guia Lopes", logradouro: "Rua X", proprietarioNome: "Maria Souza" },
  tenant: { nome: "Ana Lima" },
  tenants: [{ nome: "Ana Lima" }, { nome: "José Luís Pereira" }],
};

test("finds a contract by co-tenant name ignoring accents", () => {
  assert.equal(matchesRentalSearch(contract, "jose luis"), true);
});

test("finds a contract by owner name", () => {
  assert.equal(matchesRentalSearch(contract, "maria"), true);
});

test("does not match an unrelated name", () => {
  assert.equal(matchesRentalSearch(contract, "carlos"), false);
});

test("secretaria searches Aluguéis via page search without global search", () => {
  const { modules } = roleDefinitions.secretaria;
  assert.equal(modules.includes("alugueis"), true);
  assert.equal(getHeaderSearchMode(modules, true), "page");
  assert.equal(getHeaderSearchMode(modules, false), null);
});
