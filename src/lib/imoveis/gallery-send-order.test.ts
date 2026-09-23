import { strict as assert } from "node:assert";
import test from "node:test";
import { sendOrderForSite } from "./gallery-plan";

const img = (id: string, position: number) => ({ id, position });

test("envia a capa primeiro e o resto da última para a primeira", () => {
  const out = sendOrderForSite([img("a", 0), img("b", 1), img("c", 2), img("d", 3)], "a");
  assert.deepEqual(out.map((i) => i.id), ["a", "d", "c", "b"]);
});

test("sem capa pendente, só inverte as demais", () => {
  const out = sendOrderForSite([img("b", 1), img("c", 2)], "a");
  assert.deepEqual(out.map((i) => i.id), ["c", "b"]);
});
