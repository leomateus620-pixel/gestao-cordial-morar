import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantChoice } from "./choices";

test("choices are bounded, masked and never contain an execution payload", () => {
  const choice = assistantChoice({ question: "Qual período?", choices: ["Hoje", "Amanhã"] }, "c1");
  assert.deepEqual(
    choice.options.map((o) => o.value),
    ["Hoje", "Amanhã"],
  );
  assert.equal(choice.allowOther, true);
  assert.throws(() =>
    assistantChoice({ question: "Qual?", choices: ["Hoje"], payload: {} }, "bad"),
  );
  assert.throws(() => assistantChoice({ question: "Qual?", choices: ["A", "A"] }, "bad"));
});
test("choice labels remove model links/html and mask contacts", () => {
  const choice = assistantChoice(
    { question: "Qual contato?", choices: ["ana@example.com", "<b>Outro</b> https://evil.test/x"] },
    "c2",
  );
  const json = JSON.stringify(choice);
  assert(!json.includes("ana@example.com"));
  assert(!json.includes("https://"));
  assert(!json.includes("<b>"));
});
