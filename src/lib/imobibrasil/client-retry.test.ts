import { strict as assert } from "node:assert";
import test from "node:test";
import { imobiRequest } from "./client.server";
import { ImobiApiError } from "./errors";

process.env["IMOBIBRASIL_CORDIAL_TOKEN"] ??= "teste";
process.env["IMOBIBRASIL_MORAR_TOKEN"] ??= "teste";

function stubFetch(responses: Array<() => Response>) {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => responses[Math.min(calls++, responses.length - 1)]()) as typeof fetch;
  return { calls: () => calls, restore: () => (globalThis.fetch = original) };
}

test("vaga do limitador é pedida antes de cada tentativa", async () => {
  let slots = 0;
  const f = stubFetch([
    () => new Response("", { status: 503 }),
    () => new Response(JSON.stringify({ status: true }), { status: 200 }),
  ]);
  try {
    await imobiRequest("cordial", "/x", { acquireSlot: async () => void slots++ });
  } finally { f.restore(); }
  assert.equal(f.calls(), 2);
  assert.equal(slots, 2);
});

test("Retry-After longo não é repetido antes da hora", async () => {
  const f = stubFetch([() => new Response("", { status: 429, headers: { "Retry-After": "120" } })]);
  let err: ImobiApiError | null = null;
  try {
    await imobiRequest("cordial", "/x", { acquireSlot: async () => {} });
  } catch (e) { err = e as ImobiApiError; } finally { f.restore(); }
  assert.equal(f.calls(), 1);
  assert.equal(err?.category, "rate_limit");
  assert.equal(err?.retryAfterSeconds, 120);
});

test("limitador sem vaga/indisponível: o site não é chamado", async () => {
  const f = stubFetch([() => new Response("{}", { status: 200 })]);
  await assert.rejects(
    imobiRequest("morar", "/x", {
      acquireSlot: async () => {
        throw new ImobiApiError({ message: "indisponível", category: "rate_limit", retryAfterSeconds: 30 });
      },
    }),
  );
  f.restore();
  assert.equal(f.calls(), 0);
});

test("POST com timeout não é repetido às cegas", async () => {
  const f = stubFetch([() => { throw new TypeError("fetch failed"); }]);
  await assert.rejects(imobiRequest("cordial", "/imovel/inserir", { method: "POST", acquireSlot: async () => {} }));
  f.restore();
  assert.equal(f.calls(), 1);
});

test("falha numa conta não consome vaga da outra", async () => {
  const seen: string[] = [];
  const f = stubFetch([() => new Response(JSON.stringify({ status: true }), { status: 200 })]);
  await imobiRequest("morar", "/x", { acquireSlot: async (p) => void seen.push(p) });
  f.restore();
  assert.deepEqual(seen, ["morar"]);
});
