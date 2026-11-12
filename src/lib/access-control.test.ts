import assert from "node:assert/strict";
import test from "node:test";
import { canAccessModule, canArchiveProperty, canDeleteAttendance, canSelfAssignAttendance } from "./access-control.ts";

const admin = { id: "u-admin", perfil: "admin_owner" as const, modules: [] };
const corretor = { id: "u-corretor", perfil: "corretor" as const, modules: [] };
const secretaria = { id: "u-secretaria", perfil: "secretaria" as const, modules: [] };

const atendimento = { criadoPorId: "u-secretaria" };

test("admin pode excluir qualquer atendimento", () => {
  assert.equal(canDeleteAttendance(admin, atendimento), true);
});

test("criador do atendimento pode excluir", () => {
  assert.equal(canDeleteAttendance(secretaria, atendimento), true);
});

test("corretor que não criou não pode excluir", () => {
  assert.equal(canDeleteAttendance(corretor, atendimento), false);
});

test("sem sessão ou sem criador conhecido não pode excluir", () => {
  assert.equal(canDeleteAttendance(null, atendimento), false);
  assert.equal(canDeleteAttendance(secretaria, {}), false);
});

test("corretor pode se autovincular, administração não precisa do autovínculo", () => {
  assert.equal(canSelfAssignAttendance(corretor), true);
  assert.equal(canSelfAssignAttendance(secretaria), false);
  assert.equal(canSelfAssignAttendance(null), false);
});

test("arquivar imóvel: admin, secretaria e corretor; financeiro e sem sessão não", () => {
  assert.equal(canArchiveProperty(admin), true);
  assert.equal(canArchiveProperty(secretaria), true);
  assert.equal(canArchiveProperty(corretor), true);
  assert.equal(canArchiveProperty({ perfil: "financeiro_admin" as const, modules: [] }), false);
  assert.equal(canArchiveProperty(null), false);
});

test("meta_reviewer can open marketing and integracoes only", () => {
  const s = { perfil: "meta_reviewer" as const, modules: [] };
  assert.equal(canAccessModule(s, "marketing"), true);
  assert.equal(canAccessModule(s, "integracoes"), true);
  for (const m of ["imoveis", "clientes", "atendimentos", "financeiro", "configuracoes", "dashboard"] as const)
    assert.equal(canAccessModule(s, m), false, m);
});

test("atendimentos_viewer only opens Atendimentos and never writes", async () => {
  const { canWriteAttendances, canManageAttendanceAssignments, canSelfAssignAttendance, canManageAttendanceTerminalState, canSeeAttendanceHandoffMessage, canSeeFinancialInsights, canSeeAdminInsights, canSeeNotificationMetrics } = await import("./access-control.ts");
  const { roleDefinitions } = await import("./mock/permissions.ts");
  const s = { id: "u-viewer", perfil: "atendimentos_viewer" as const, modules: [] };
  assert.deepEqual(roleDefinitions.atendimentos_viewer.modules, ["atendimentos"]);
  assert.deepEqual(roleDefinitions.atendimentos_viewer.permissions, ["atendimentos:read"]);
  assert.equal(canAccessModule(s, "atendimentos"), true);
  for (const m of ["dashboard", "imoveis", "clientes", "agenda", "marketing", "alugueis", "vendas", "financeiro", "configuracoes", "busca", "integracoes"] as const)
    assert.equal(canAccessModule(s, m), false, m);
  assert.equal(canWriteAttendances(s), false);
  assert.equal(canDeleteAttendance(s, { criadoPorId: "u-viewer" }), false);
  for (const fn of [canManageAttendanceAssignments, canSelfAssignAttendance, canManageAttendanceTerminalState, canSeeAttendanceHandoffMessage, canSeeFinancialInsights, canSeeAdminInsights, canSeeNotificationMetrics])
    assert.equal(fn(s), false, fn.name);
  assert.equal(canWriteAttendances(corretor), true);
  assert.equal(canWriteAttendances(secretaria), true);
});

test("deny-dominant roles win over staff roles", async () => {
  const { pickHighestRole, mapDbRole } = await import("./role-mapping.ts");
  assert.equal(mapDbRole("atendimentos_viewer"), "atendimentos_viewer");
  assert.equal(mapDbRole("algo_desconhecido"), "corretor");
  assert.equal(pickHighestRole(["corretor", "atendimentos_viewer"]), "atendimentos_viewer");
  assert.equal(pickHighestRole(["admin_owner", "atendimentos_viewer"]), "atendimentos_viewer");
  assert.equal(pickHighestRole(["admin_owner", "meta_reviewer"]), "meta_reviewer");
  assert.equal(pickHighestRole(["admin_owner", "corretor"]), "admin_owner");
});

test("database boundary for atendimentos_viewer stays deny-dominant", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync("drizzle/migrations/0091_atendimentos_viewer_boundary.sql", "utf8");
  // has_role keeps meta_reviewer and adds the viewer.
  assert.match(sql, /role::text='meta_reviewer'\)\)\s*AND \(_role::text='atendimentos_viewer' OR NOT EXISTS/);
  // Allowlist is exactly the attendance tables plus session identity.
  assert.match(sql, /NOT IN \('attendances','attendance_history','attendance_assignments','profiles','user_roles','user_agencies'\)/);
  assert.match(sql, /atendimentos_viewer_no_insert/);
  assert.match(sql, /atendimentos_viewer_no_update/);
  assert.match(sql, /atendimentos_viewer_no_delete/);
  assert.match(sql, /atendimentos_viewer_entry_guard_v1[\s\S]*ERRCODE=''42501''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.provision_atendimentos_viewer\(uuid, text\[\]\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /raw_user_meta_data/);
});
