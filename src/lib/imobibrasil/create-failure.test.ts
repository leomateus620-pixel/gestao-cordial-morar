import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCreateFailure } from "./create-failure";

test("429 do site e 400/422 de validação são definitivos", () => {
  assert.equal(classifyCreateFailure({ category: "rate_limit", httpStatus: 429 }), "definitive");
  assert.equal(classifyCreateFailure({ category: "validation", httpStatus: 400 }), "definitive");
  assert.equal(classifyCreateFailure({ category: "validation", httpStatus: 422 }), "definitive");
});

test("erros locais antes do envio são definitivos", () => {
  assert.equal(classifyCreateFailure({ category: "mapping", beforeSend: true }), "definitive");
  assert.equal(classifyCreateFailure({ category: "paused", beforeSend: true }), "definitive");
});

test("401, 403, 404 e 409 ficam ambíguos", () => {
  for (const status of [401, 403, 404, 409]) {
    assert.equal(classifyCreateFailure({ category: "auth", httpStatus: status }), "ambiguous");
    assert.equal(classifyCreateFailure({ category: "validation", httpStatus: status }), "ambiguous");
  }
});

test("rede, timeout, 5xx, sem ID e limite local sem HTTP ficam ambíguos", () => {
  assert.equal(classifyCreateFailure({ category: "network", httpStatus: null }), "ambiguous");
  assert.equal(classifyCreateFailure({ category: "server", httpStatus: 502 }), "ambiguous");
  assert.equal(classifyCreateFailure({ category: "protocol", httpStatus: 200, ambiguous: true }), "ambiguous");
  assert.equal(classifyCreateFailure({ category: "rate_limit", httpStatus: null }), "ambiguous");
  assert.equal(classifyCreateFailure({ category: "validation", httpStatus: 422, ambiguous: true }), "ambiguous");
  assert.equal(classifyCreateFailure({ category: "mapping" }), "ambiguous");
});
