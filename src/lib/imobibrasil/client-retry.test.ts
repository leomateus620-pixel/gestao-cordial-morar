import { test } from "node:test";
import assert from "node:assert/strict";
import { imobiRequest, hasProviderToken } from "./client.server";

// ImobiBrasil OFF: nenhuma tentativa de rede, nenhuma vaga pedida, mesmo com token.
test("OFF bloqueia GET e POST antes da rede e da credencial", async () => {
  process.env.IMOBIBRASIL_CORDIAL_TOKEN = "token-presente";
  let slots = 0;
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
  try {
    for (const method of ["GET", "POST"] as const) {
      await assert.rejects(
        imobiRequest("cordial", "/x", { method, acquireSlot: async () => void slots++ }),
        (e: { category?: string; retryable?: boolean }) => e.category === "disabled" && e.retryable === false,
      );
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
  assert.equal(slots, 0);
  assert.equal(hasProviderToken("cordial"), false);
});
