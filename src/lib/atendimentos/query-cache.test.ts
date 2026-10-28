import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  ATTENDANCES_QUERY_KEY,
  attendanceListQueryKey,
  attendanceBrokersQueryKey,
  attendanceHistoryQueryKey,
  rollbackAttendanceTransition,
} from "./query-cache";
import type { Atendimento } from "../../types/atendimento";

const original = {
  id: "contact-a",
  pipelineStage: "primeiro_contato",
  atualizadoEm: "2026-10-28T10:00:00Z",
  observacoes: "Anotação inicial",
} as Atendimento;

test("each user receives a separate attendance list, brokers and history cache", () => {
  const client = new QueryClient();
  const aliceKey = attendanceListQueryKey("alice");
  const bobKey = attendanceListQueryKey("bob");
  client.setQueryData(aliceKey, [original]);
  assert.equal(client.getQueryData(bobKey), undefined);
  assert.equal(client.getQueryData(attendanceListQueryKey(undefined)), undefined);
  assert.notDeepEqual(attendanceBrokersQueryKey("alice"), attendanceBrokersQueryKey("bob"));
  assert.notDeepEqual(
    [...attendanceHistoryQueryKey(original.id), "alice"],
    [...attendanceHistoryQueryKey(original.id), "bob"],
  );
  assert.equal(client.getQueriesData({ queryKey: ATTENDANCES_QUERY_KEY }).length, 1);
  client.clear();
});

test("failure of one transition preserves another contact's concurrent move and latest edits", () => {
  const other = { ...original, id: "contact-b", pipelineStage: "proposta" as const };
  const moved = {
    ...original,
    pipelineStage: "visita" as const,
    atualizadoEm: "2026-10-28T11:00:00Z",
    observacoes: "Anotação salva durante a movimentação",
  };
  const current = [moved, other];
  const rolledBack = rollbackAttendanceTransition(current, original)!;
  assert.equal(rolledBack[0].pipelineStage, "primeiro_contato");
  assert.equal(rolledBack[0].atualizadoEm, original.atualizadoEm);
  assert.equal(rolledBack[0].observacoes, "Anotação salva durante a movimentação");
  assert.equal(rolledBack[1], other);
  assert.equal(current[0].pipelineStage, "visita");
});

test("a rollback stays in its original user cache after an account change", () => {
  const client = new QueryClient();
  const aliceKey = attendanceListQueryKey("alice");
  const bobKey = attendanceListQueryKey("bob");
  const bobsContact = { ...original, pipelineStage: "fechamento" as const };
  client.setQueryData(aliceKey, [{ ...original, pipelineStage: "visita" }]);
  client.setQueryData(bobKey, [bobsContact]);
  client.setQueryData<Atendimento[]>(aliceKey, (current) =>
    rollbackAttendanceTransition(current, original),
  );
  assert.equal(client.getQueryData<Atendimento[]>(aliceKey)?.[0].pipelineStage, "primeiro_contato");
  assert.equal(client.getQueryData<Atendimento[]>(bobKey)?.[0], bobsContact);
  client.clear();
});

test("rollback does not resurrect a removed attendance or a cleared cache", () => {
  assert.deepEqual(rollbackAttendanceTransition([], original), []);
  assert.equal(rollbackAttendanceTransition(undefined, original), undefined);
  const current = [original];
  assert.equal(rollbackAttendanceTransition(current, undefined), current);
});
