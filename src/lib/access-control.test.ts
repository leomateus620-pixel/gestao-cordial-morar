import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteAttendance } from "./access-control.ts";

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
