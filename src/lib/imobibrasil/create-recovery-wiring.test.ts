import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./sync.server.ts", import.meta.url), "utf8");

test("reversão do checkpoint só no ramo definitivo e nunca repete o POST", () => {
  const definitive = source.split('if (kind === "definitive") {')[1] ?? "";
  const block = definitive.slice(0, 900);
  assert.ok(block.includes("property_publication_revert_prepare_create"));
  assert.equal(block.includes("/imovel/inserir\", {"), false);
  assert.equal((source.match(/"\/imovel\/inserir", \{/g) ?? []).length, 1);
});

test("toda falha do POST é registrada antes de qualquer throw", () => {
  const catchBlock = source.split("const postDuration")[1] ?? "";
  const logIdx = catchBlock.indexOf("await logAttempt(");
  const throwIdx = catchBlock.indexOf("throw ");
  assert.ok(logIdx > -1 && logIdx < throwIdx);
  assert.ok(catchBlock.includes('requestPath: "/imovel/inserir"'));
});

test("perda de posse e limite também deixam registro", () => {
  assert.ok((source.match(/outcome: "lease_lost"/g) ?? []).length >= 3);
  assert.ok(source.includes('rateLimited ? "rate_limited"'));
});

test("falha ao gravar o registro não derruba o trabalho", () => {
  const log = source.split("async function logAttempt(")[1]?.split("export type AttemptOutcome")[0] ?? "";
  assert.equal(log.includes("throw new Error"), false);
  assert.ok(log.includes("console.error"));
});

test("conferência pós-criação usa agenda curta e não consome tentativa", () => {
  assert.ok(source.includes("reconcileDelaySeconds(normalized.reconcileAbsentChecks ?? 0)"));
  assert.ok(source.includes("attempts: rateLimited || reconciling ||"));
});
