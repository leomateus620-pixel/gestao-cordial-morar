import assert from "node:assert/strict";
import test from "node:test";
import { inspectionLayout } from "./layout";
test("shell e assistente usam uma política única para central, criação e execução", () => {
  assert.equal(inspectionLayout("/vistorias"), "central");
  assert.equal(inspectionLayout("/vistorias/"), "central");
  assert.equal(inspectionLayout("/vistorias/nova"), "workspace");
  assert.equal(inspectionLayout("/vistorias/10000000-0000-4000-8000-000000000001"), "workspace");
  assert.equal(inspectionLayout("/imoveis"), null);
  assert.equal(inspectionLayout("/assistente/cordial"), null);
  assert.equal(inspectionLayout("/vistorias-outra"), null);
});
