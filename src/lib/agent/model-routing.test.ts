import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantMaxTokens, assistantModel, interimTier } from "./model-routing";
test("modelos por env com padrões", () => {
  assert.equal(assistantModel("fast", {}), "google/gemini-3.8-flash");
  assert.equal(assistantModel("router", {}), "google/gemini-3.1-flash-lite");
  assert.equal(assistantModel("fast", { ASSISTANT_FAST_MODEL: "x/y" }), "x/y");
});
test("limite de tokens: curto 1200, relatório 4000", () => {
  assert.equal(assistantMaxTokens("fast"), 1200);
  assert.equal(assistantMaxTokens("analysis"), 4000);
  assert.equal(interimTier("faça um relatório da carteira"), "analysis");
});
