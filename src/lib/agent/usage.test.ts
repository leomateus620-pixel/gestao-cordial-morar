import test from "node:test";
import assert from "node:assert/strict";
import { estimateGatewayCost, parseGatewayUsage } from "./usage.ts";
test("usage rejects absent or fabricated token values", () => {
  assert.equal(parseGatewayUsage({}), undefined);
  assert.equal(parseGatewayUsage({ prompt_tokens: -1, completion_tokens: 4 }), undefined);
  assert.deepEqual(
    parseGatewayUsage({
      prompt_tokens: 10,
      completion_tokens: 2,
      prompt_tokens_details: { cached_tokens: 100 },
    }),
    { promptTokens: 10, completionTokens: 2, cachedTokens: 10 },
  );
});
test("cost requires real usage and versioned configured rates", () => {
  assert.equal(estimateGatewayCost("m", undefined).estimatedCostUsd, null);
  assert.equal(
    estimateGatewayCost("m", { promptTokens: 20, completionTokens: 3, cachedTokens: 0 }, "{}")
      .estimatedCostUsd,
    null,
  );
  assert.deepEqual(
    estimateGatewayCost(
      "m",
      { promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 500_000 },
      JSON.stringify({
        m: { version: "test-2026", inputPerMillion: 2, outputPerMillion: 4, cachedPerMillion: 1 },
      }),
    ),
    { estimatedCostUsd: 5.5, rateVersion: "test-2026" },
  );
});
