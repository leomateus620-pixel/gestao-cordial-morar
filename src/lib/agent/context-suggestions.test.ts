import { test } from "node:test";
import assert from "node:assert/strict";
import { getAgentBot } from "./bots";
import { contextualSuggestions } from "./context-suggestions";
const context = { kind: "client" as const, id: "00000000-0000-4000-8000-000000000001" };
test("next steps derive from permitted capabilities and actual results", () => {
  const match = getAgentBot("match")!;
  const prompts = contextualSuggestions(match, context, [
    {
      tool: "match_client_properties",
      data: { properties: [{ id: "x" }], missingCriteria: ["Orçamento"] },
    },
  ]);
  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /preferências/);
  assert(prompts.some((s) => /seleção/.test(s)));
  assert(!prompts.some((s) => /nota|visita|NFS/.test(s)));
  assert.deepEqual(contextualSuggestions({ ...match, active: false }, context), []);
});
test("unavailable or empty results never create selection suggestions", () => {
  assert.deepEqual(
    contextualSuggestions(getAgentBot("match")!, undefined, [
      { tool: "search_properties", data: { properties: [] } },
    ]),
    [],
  );
  const prompts = contextualSuggestions(getAgentBot("lead")!, { ...context, kind: "rental" });
  assert(!prompts.some((s) => /fiscais|contrato/.test(s)));
});
