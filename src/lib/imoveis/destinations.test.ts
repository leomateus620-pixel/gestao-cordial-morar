import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationChanges, normalizeDestinations } from "./destinations";

test("Ambas vira as duas marcas, sem duplicar", () => {
  assert.deepEqual(normalizeDestinations(["ambas", "morar", "cordial"]), ["cordial", "morar"]);
});

test("só Cordial não concede Morar", () => {
  assert.deepEqual(normalizeDestinations(["cordial"]), ["cordial"]);
});

test("só Morar não concede Cordial", () => {
  assert.deepEqual(normalizeDestinations(["morar"]), ["morar"]);
});

test("valores desconhecidos são ignorados", () => {
  assert.deepEqual(normalizeDestinations(["imobi", "", null]), []);
});

test("troca de destino afeta só o canal alterado", () => {
  assert.deepEqual(destinationChanges(["cordial", "morar"], ["morar"]), { added: [], removed: ["cordial"] });
});
