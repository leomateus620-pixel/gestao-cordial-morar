import assert from "node:assert/strict";
import test from "node:test";
import {
  applicableChecklistItems,
  bonusPendingItems,
  checklistProgress,
  emptyChecklist,
} from "./checklist.ts";

test("remove o provedor não selecionado do progresso", () => {
  const somenteCordial = applicableChecklistItems("cordial").map((i) => i.key);
  assert.ok(somenteCordial.includes("cadastradoCordial"));
  assert.ok(!somenteCordial.includes("cadastradoMorar"));

  const ambas = applicableChecklistItems("ambas").map((i) => i.key);
  assert.ok(ambas.includes("cadastradoCordial"));
  assert.ok(ambas.includes("cadastradoMorar"));
});

test("não penaliza o progresso por item Não se aplica", () => {
  const checklist = { ...emptyChecklist(), cadastradoCordial: true };
  const cordial = checklistProgress(checklist, "cordial");
  assert.equal(cordial.applicable, 6);
  assert.equal(cordial.completed, 1);

  const ambas = checklistProgress(checklist, "ambas");
  assert.equal(ambas.applicable, 7);
  assert.equal(ambas.completed, 1);
});

test("lista as pendências que impedem a bonificação", () => {
  const checklist = {
    ...emptyChecklist(),
    fotosHorizontal: true,
    fotosVertical: true,
    cadastradoMorar: true,
  };
  assert.deepEqual(
    bonusPendingItems(checklist).map((i) => i.key),
    ["cadastradoCordial"],
  );
  assert.equal(bonusPendingItems({ ...checklist, cadastradoCordial: true }).length, 0);
});
