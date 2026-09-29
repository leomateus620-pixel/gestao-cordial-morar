import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileDelaySeconds, RECONCILE_FIXED_SECONDS } from "./queue-policy";

test("leituras 1, 2 e 3 em 60/120/180 s", () => {
  assert.equal(reconcileDelaySeconds(0), 60);
  assert.equal(reconcileDelaySeconds(1), 120);
  assert.equal(reconcileDelaySeconds(2), 180);
});

test("depois, intervalo fixo de 10 minutos, sem espera crescente", () => {
  assert.equal(RECONCILE_FIXED_SECONDS, 600);
  for (const n of [3, 4, 7, 20, 100]) assert.equal(reconcileDelaySeconds(n), 600);
});

test("valores inválidos começam do início", () => {
  assert.equal(reconcileDelaySeconds(-3), 60);
  assert.equal(reconcileDelaySeconds(Number.NaN), 60);
});
