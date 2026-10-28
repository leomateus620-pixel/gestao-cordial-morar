import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendanceWorkspaceView,
  expandAttendanceStage,
  parseAttendanceWorkspace,
} from "./workspace-navigation";

test("invalid or archived stages cannot create an expanded workspace", () => {
  for (const etapa of [undefined, "arquivado", "fechado", "unknown", {}, ["visita"]]) {
    assert.deepEqual(attendanceWorkspaceView(parseAttendanceWorkspace({ modo: "etapa", etapa })), {
      kind: "funil",
    });
  }
});
test("reload parses expanded stage independently from opened attendance", () => {
  const search = { modo: "etapa", etapa: "em_espera", origem: "lista", id: "attendance" };
  assert.deepEqual(attendanceWorkspaceView(parseAttendanceWorkspace(search)), {
    kind: "etapa",
    stage: "em_espera",
    returnTo: "lista",
  });
});
test("expansion and stage switching retain the return mode and existing deep link filters", () => {
  const original = {
    modo: "lista",
    id: "a",
    clienteId: "c",
    track: "aluguel",
    corretorId: "b",
    periodo: "mes",
    imobiliaria: "cordial",
    status: "novo",
  };
  const first = expandAttendanceStage(original, "primeiro_contato");
  const second = expandAttendanceStage(first, "perdido");
  assert.equal(second.origem, "lista");
  for (const key of [
    "id",
    "clienteId",
    "track",
    "corretorId",
    "periodo",
    "imobiliaria",
    "status",
  ] as const)
    assert.equal(second[key], original[key]);
  assert.equal(second.etapa, "perdido");
});
test("base list and stage selection are not conflated", () => {
  assert.deepEqual(
    attendanceWorkspaceView(parseAttendanceWorkspace({ modo: "lista", etapa: "proposta" })),
    { kind: "lista" },
  );
  assert.equal(parseAttendanceWorkspace({ modo: "lista", etapa: "proposta" }).etapa, "proposta");
});
