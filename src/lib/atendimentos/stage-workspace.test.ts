import test from "node:test";
import assert from "node:assert/strict";
import type { Atendimento, PipelineStage } from "@/types/atendimento";
import {
  WORKSPACE_PIPELINE_STAGES,
  groupAttendancesByStage,
  isWorkspacePipelineStage,
  selectStageAttendances,
} from "./stage-workspace";

const now = new Date("2026-10-28T12:00:00Z");
const contact = (id: string, patch: Partial<Atendimento> = {}): Atendimento => ({
  id,
  clienteNome: `Contato ${id}`,
  telefone: "(47) 99123-4567",
  contatoPreferencial: "whatsapp",
  origem: "site",
  imobiliaria: "cordial",
  finalidade: "compra",
  tipoImovel: "apartamento",
  prioridade: "media",
  status: "novo",
  pipelineStage: "primeiro_contato",
  historico: [],
  criadoEm: "2026-10-01T10:00:00Z",
  atualizadoEm: "2026-10-28T10:00:00Z",
  ...patch,
});

test("seven workspaces include waiting/lost, while archives remain outside navigation", () => {
  assert.equal(WORKSPACE_PIPELINE_STAGES.length, 7);
  assert.equal(isWorkspacePipelineStage("em_espera"), true);
  assert.equal(isWorkspacePipelineStage("perdido"), true);
  for (const value of ["arquivado", "novo", "invalid", null, 1]) {
    assert.equal(isWorkspacePipelineStage(value), false);
  }
});

for (const count of [0, 1, 15, 40, 500]) {
  test(`${count} contacts remain available without a silent grid limit`, () => {
    const items = Array.from({ length: count }, (_, index) => contact(`${index}`));
    const grouped = groupAttendancesByStage(items);
    assert.equal(grouped.counts.primeiro_contato, count);
    assert.equal(
      selectStageAttendances(grouped.byStage.primeiro_contato, "", "retorno", now).length,
      count,
    );
  });
}

test("final client cut drives both stage counts and grid without merging different attendances", () => {
  const grouped = groupAttendancesByStage(
    [
      contact("a", { clienteId: "client-a" }),
      contact("b", { clienteConvertidoId: "client-a", pipelineStage: "proposta" }),
      contact("c", { clienteId: "client-a" }),
      contact("d", { clienteId: "client-b" }),
    ],
    "client-a",
  );
  assert.deepEqual(
    grouped.base.map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.equal(grouped.counts.primeiro_contato, 2);
  assert.equal(grouped.counts.proposta, 1);
  assert.equal(grouped.byStage.primeiro_contato.length, grouped.counts.primeiro_contato);
});

test("moving an id updates origin/destination; restoring the source restores counts", () => {
  const items = [contact("a"), contact("b")];
  const moved = items.map((item) =>
    item.id === "a" ? { ...item, pipelineStage: "visita" as PipelineStage } : item,
  );
  const result = groupAttendancesByStage(moved);
  assert.equal(result.counts.primeiro_contato, 1);
  assert.equal(result.counts.visita, 1);
  assert.deepEqual(
    result.byStage.visita.map((item) => item.id),
    ["a"],
  );
  assert.equal(groupAttendancesByStage(items).counts.primeiro_contato, 2);
});

test("local normalized search returns X of Y while preserving global counts and source order", () => {
  const items = Array.from({ length: 40 }, (_, index) =>
    contact(`${index}`, {
      clienteNome: index < 6 ? `José ${index}` : `Maria ${index}`,
      telefone: index === 0 ? "(47) 99876-5432" : "",
    }),
  );
  const grouped = groupAttendancesByStage(items);
  assert.equal(selectStageAttendances(grouped.byStage.primeiro_contato, "jose", "nome").length, 6);
  assert.equal(
    selectStageAttendances(grouped.byStage.primeiro_contato, "47998765432", "nome").length,
    1,
  );
  assert.equal(grouped.counts.primeiro_contato, 40);
  assert.equal(selectStageAttendances(grouped.byStage.primeiro_contato, "", "nome").length, 40);
  assert.deepEqual(
    items.map((item) => item.id),
    Array.from({ length: 40 }, (_, index) => `${index}`),
  );
});

test("follow-up sorting prioritizes actual overdue dates, then appointments, then absent/invalid dates", () => {
  const sorted = selectStageAttendances(
    [
      contact("missing"),
      contact("invalid", { proximoRetorno: "invalid" }),
      contact("future", { proximoRetorno: "2026-10-29T10:00:00Z" }),
      contact("late", { proximoRetorno: "2026-10-27T10:00:00Z" }),
      contact("later", { proximoRetorno: "2026-10-30T10:00:00Z" }),
      contact("first", { proximoRetorno: "2026-10-26T10:00:00Z" }),
      contact("terminal", { pipelineStage: "perdido", proximoRetorno: "2026-10-01T10:00:00Z" }),
    ],
    "",
    "retorno",
    now,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["first", "late", "terminal", "future", "later", "invalid", "missing"],
  );
});

test("other sort modes handle invalid dates, accents, and deterministic id ties", () => {
  const items = [
    contact("b", { clienteNome: "Álvaro", atualizadoEm: "bad", criadoEm: "bad" }),
    contact("c", {
      clienteNome: "Bia",
      atualizadoEm: "2026-10-02T00:00:00Z",
      criadoEm: "2026-10-02T00:00:00Z",
    }),
    contact("a", {
      clienteNome: "Alvaro",
      atualizadoEm: "2026-10-02T00:00:00Z",
      criadoEm: "2026-10-02T00:00:00Z",
    }),
  ];
  assert.deepEqual(
    selectStageAttendances(items, "", "nome").map((item) => item.id),
    ["a", "b", "c"],
  );
  for (const mode of ["atualizacao", "criacao"] as const) {
    assert.deepEqual(
      selectStageAttendances(items, "", mode).map((item) => item.id),
      ["a", "c", "b"],
    );
  }
});
