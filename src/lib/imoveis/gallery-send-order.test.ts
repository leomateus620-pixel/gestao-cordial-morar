import { strict as assert } from "node:assert";
import test from "node:test";
import { sendOrderForSite } from "./gallery-plan";

const img = (id: string, position: number) => ({ id, position });

test("envia a capa primeiro e o resto em ordem crescente (o site exibe na ordem de envio)", () => {
  const out = sendOrderForSite([img("d", 3), img("a", 0), img("c", 2), img("b", 1)], "a");
  assert.deepEqual(out.map((i) => i.id), ["a", "b", "c", "d"]);
});

test("sem capa pendente, mantém a ordem do Gestão", () => {
  const out = sendOrderForSite([img("c", 2), img("b", 1)], "a");
  assert.deepEqual(out.map((i) => i.id), ["b", "c"]);
});
