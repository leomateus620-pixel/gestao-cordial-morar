import assert from "node:assert/strict";
import test from "node:test";
import { roleDefinitions, type UserProfile } from "../../lib/mock/permissions.ts";
import {
  getSidebarSections,
  getVisibleModules,
  isModuleItemActive,
  moduleItems,
  sidebarSectionLabels,
  sidebarSectionOrder,
} from "./module-menu.ts";

function sidebarPaths(profile: UserProfile) {
  return getSidebarSections(roleDefinitions[profile].modules).flatMap((section) =>
    section.items.map((item) => item.to),
  );
}

test("derives a flat, ordered admin sidebar from the canonical module registry", () => {
  assert.deepEqual(sidebarPaths("admin_owner"), [
    "/",
    "/agenda",
    "/agenda/fotos",
    "/agenciamentos",
    "/imoveis",
    "/atendimentos",
    "/alugueis",
    "/vendas",
    "/corretores",
    "/financeiro",
    "/relatorios",
    "/pesquisa-satisfacao",
    "/marketing",
    "/documentos",
    "/integracoes",
    "/configuracoes",
  ]);

  assert.deepEqual(
    getSidebarSections(roleDefinitions.admin_owner.modules).map((section) => section.label),
    sidebarSectionOrder.map((id) => sidebarSectionLabels[id]),
  );
});

test("keeps sidebar visibility aligned with every authenticated role", () => {
  assert.deepEqual(sidebarPaths("secretaria"), [
    "/",
    "/agenda",
    "/agenda/fotos",
    "/agenciamentos",
    "/atendimentos",
    "/alugueis",
    "/marketing",
  ]);
  assert.deepEqual(sidebarPaths("corretor"), [
    "/",
    "/agenda",
    "/agenda/fotos",
    "/agenciamentos",
    "/atendimentos",
    "/vendas",
  ]);
  assert.deepEqual(sidebarPaths("financeiro_admin"), [
    "/",
    "/financeiro",
    "/relatorios",
    "/documentos",
    "/integracoes",
  ]);
});

test("fails closed without an authorized module list and never duplicates routes", () => {
  assert.deepEqual(getVisibleModules(undefined), []);
  assert.deepEqual(getVisibleModules([]), []);
  assert.deepEqual(getSidebarSections(undefined), []);

  const paths = moduleItems.map((item) => item.to);
  assert.equal(new Set(paths).size, paths.length);
});

test("removes only the Clientes navigation reference and preserves role authorization", () => {
  assert.equal(
    moduleItems.some((item) => item.to === "/clientes"),
    false,
  );

  for (const profile of Object.keys(roleDefinitions) as UserProfile[]) {
    assert.equal(roleDefinitions[profile].modules.includes("clientes"), true, profile);
  }
});

test("matches active routes without allowing sibling-prefix collisions", () => {
  assert.equal(isModuleItemActive("/", { to: "/", exact: true }), true);
  assert.equal(isModuleItemActive("/agenda/fotos", { to: "/agenda", exact: true }), false);
  assert.equal(isModuleItemActive("/agenda/fotos", { to: "/agenda/fotos" }), true);
  assert.equal(isModuleItemActive("/alugueis/abc", { to: "/alugueis" }), true);
  assert.equal(isModuleItemActive("/imoveis-destaque", { to: "/imoveis" }), false);
});
