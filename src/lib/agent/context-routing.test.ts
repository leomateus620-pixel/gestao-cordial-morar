import test from "node:test";
import assert from "node:assert/strict";
import {
  contextFromLocation,
  contextForActiveBot,
  contextSuggestions,
  preferredBotForContext,
} from "./context-routing";
const id = "00000000-0000-4000-8000-000000000101";

test("record context routing accepts only actual module routes and UUID identifiers", () => {
  assert.deepEqual(contextFromLocation(`/imoveis/${id}`, ""), { kind: "property", id });
  assert.deepEqual(contextFromLocation(`/clientes/${id}/`, ""), { kind: "client", id });
  assert.deepEqual(contextFromLocation("/alugueis", `?id=${id}`), { kind: "rental", id });
  assert.deepEqual(contextFromLocation("/atendimentos", `?id=${id}`), { kind: "attendance", id });
  assert.equal(contextFromLocation("/imoveis/not-a-uuid", ""), undefined);
  assert.equal(contextFromLocation("/imoveis", `?id=${id}`), undefined);
  assert.equal(contextFromLocation("/configuracoes", `?id=${id}`), undefined);
});

test("each record suggests a colleague with the matching specialty", () => {
  for (const [kind, bot] of [
    ["property", "match"],
    ["client", "match"],
    ["attendance", "lead"],
    ["agenciamento", "capta"],
    ["agenda", "agenda"],
    ["rental", "caixa"],
  ] as const) {
    assert.equal(preferredBotForContext({ kind, id }), bot);
  }
  assert.equal(preferredBotForContext(), "agenda");
});

test("rental context is only exposed to the active rental colleague", () => {
  const rental = { kind: "rental", id } as const;
  assert.ok(contextSuggestions(rental).length > 0);
  assert.deepEqual(contextForActiveBot("caixa", rental), rental);
  for (const bot of ["agenda", "match", "capta", "lead"])
    assert.equal(contextForActiveBot(bot, rental), undefined);
});

test("changing colleagues drops incompatible context without borrowing another module", () => {
  const client = { kind: "client", id } as const;
  const attendance = { kind: "attendance", id } as const;
  assert.deepEqual(contextForActiveBot("match", client), client);
  assert.deepEqual(contextForActiveBot("lead", attendance), attendance);
  assert.deepEqual(contextForActiveBot("agenda", attendance), attendance);
  assert.equal(contextForActiveBot("capta", client), undefined);
  assert.equal(contextForActiveBot("missing", client), undefined);
  assert.equal(contextForActiveBot("agenda"), undefined);
});
