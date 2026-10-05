import assert from "node:assert/strict";
import test from "node:test";
import { nextPaymentDueDate } from "./payment-reference";

test("baixa usa datas civis sem saltar o mês no vencimento 31", () => {
  assert.equal(nextPaymentDueDate("2026-01-31", 31), "2026-02-28");
  assert.equal(nextPaymentDueDate("2028-01-31", 31), "2028-02-29");
  assert.equal(nextPaymentDueDate("2026-12-31", 31), "2027-01-31");
  assert.equal(nextPaymentDueDate("2026-09-01", 1), "2026-10-01");
});

test("histórico ausente e vencimento impossível exigem revisão", () => {
  assert.throws(() => nextPaymentDueDate(null, 10), /Revise o vencimento/);
  assert.throws(() => nextPaymentDueDate("2026-02-31", 10), /Revise o vencimento/);
  assert.throws(() => nextPaymentDueDate("2026-13-01", 10), /Revise o vencimento/);
});
