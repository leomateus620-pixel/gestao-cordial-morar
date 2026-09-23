import test from "node:test";
import assert from "node:assert/strict";
import { shouldSendAsCover } from "./cover-decision";

const base = { readReliable: false, remoteHasCover: false, linkHasCover: false, coversSentThisRun: 0, isFirstDesired: true };

test("primeira foto sem capa conhecida vira capa mesmo sem leitura do site", () => {
  assert.equal(shouldSendAsCover(base), true);
});
test("não cria segunda capa quando o vínculo já tem capa", () => {
  assert.equal(shouldSendAsCover({ ...base, linkHasCover: true }), false);
});
test("respeita a leitura confiável do site", () => {
  assert.equal(shouldSendAsCover({ ...base, readReliable: true, remoteHasCover: true }), false);
});
test("só a primeira foto do Gestão e só uma por rodada", () => {
  assert.equal(shouldSendAsCover({ ...base, isFirstDesired: false }), false);
  assert.equal(shouldSendAsCover({ ...base, coversSentThisRun: 1 }), false);
});
