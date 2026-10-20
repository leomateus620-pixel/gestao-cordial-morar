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
    "/assistente",
    "/agenda",
    "/agenda/fotos",
    "/agenciamentos",
    "/imoveis",
    "/selecoes",
    "/atendimentos",
    "/vendas",
    "/alugueis",
    "/vistorias",
    "/corretores",
    "/financeiro",
    "/relatorios",
    "/pesquisa-satisfacao",
    "/marketing",
    "/documentos",
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
    "/assistente",
    "/agenda",
    "/agenda/fotos",
    "/agenciamentos",
    "/imoveis",
    "/selecoes",
    "/atendimentos",
    "/alugueis",
    "/vistorias",
    "/marketing",
  ]);
  assert.deepEqual(sidebarPaths("corretor"), [
    "/",
    "/assistente",
    "/agenda",
    "/agenda/fotos",
    "/agenciamentos",
    "/imoveis",
    "/selecoes",
    "/atendimentos",
    "/vendas",
    "/vistorias",
  ]);
  assert.deepEqual(sidebarPaths("financeiro_admin"), ["/", "/financeiro", "/relatorios"]);
});

test("groups rentals and inspections together and gates the contract shortcut by rental access", () => {
  for (const profile of Object.keys(roleDefinitions) as UserProfile[]) {
    const modules = roleDefinitions[profile].modules;
    const sections = getSidebarSections(modules);
    const rentalSection = sections.find((section) => section.id === "locacao");

    assert.deepEqual(
      rentalSection?.items.map((item) => item.to) ?? [],
      [
        modules.includes("alugueis") && "/alugueis",
        modules.includes("vistorias") && "/vistorias",
      ].filter(Boolean),
      profile,
    );
    assert.equal(Boolean(rentalSection?.newRentalContract), modules.includes("alugueis"), profile);
    assert.ok(sections.every((section) => section.items.length > 0));
    assert.equal(
      sections
        .filter((section) => section.id !== "locacao")
        .some((section) =>
          section.items.some((item) => item.module === "alugueis" || item.module === "vistorias"),
        ),
      false,
    );
  }
});

test("keeps search and integrations inside admin settings instead of the sidebar", () => {
  const adminSidebar = sidebarPaths("admin_owner");
  assert.equal(adminSidebar.includes("/busca"), false);
  assert.equal(adminSidebar.includes("/integracoes"), false);
  assert.equal(roleDefinitions.financeiro_admin.modules.includes("integracoes"), false);
  assert.equal(roleDefinitions.admin_owner.modules.includes("busca"), true);
  assert.equal(roleDefinitions.admin_owner.modules.includes("integracoes"), true);
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
