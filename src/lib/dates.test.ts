import assert from "node:assert/strict";
import test from "node:test";
import { addDaysToKey, dateOnlyKey, formatDateOnlyBR, parseDateOnlyLocal, todaySaoPauloKey } from "./dates.ts";

test("formata data só-dia sem voltar um dia", () => {
  assert.equal(formatDateOnlyBR("2026-10-01"), "01 de out.");
  assert.equal(formatDateOnlyBR("2026-10-01", "full"), "01/10/2026");
  assert.equal(formatDateOnlyBR("2027-01-01", "full"), "01/01/2027");
});

test("hoje em São Paulo às 21:30 BRT de 01/10 é 2026-10-01", () => {
  assert.equal(todaySaoPauloKey(new Date("2026-10-02T00:30:00.000Z")), "2026-10-01");
});

test("dateOnlyKey e parseDateOnlyLocal", () => {
  assert.equal(dateOnlyKey("2026-10-01"), "2026-10-01");
  assert.equal(dateOnlyKey("2026-10-02T00:30:00.000Z"), "2026-10-01");
  assert.equal(parseDateOnlyLocal("2026-10-01")?.getDate(), 1);
  assert.equal(addDaysToKey("2026-03-01", -30), "2026-01-30");
});
