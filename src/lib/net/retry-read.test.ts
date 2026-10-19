import { strict as assert } from "node:assert";
import test from "node:test";
import { friendlyErrorMessage, isTransientError, retryRead } from "./retry-read";

const noSleep = async () => {};

test("repete até 3 vezes em PGRST002 e devolve o sucesso", async () => {
  let calls = 0;
  const r = await retryRead(
    async () => (++calls < 3 ? { data: null, error: { code: "PGRST002" } } : { data: 1, error: null }),
    { sleep: noSleep },
  );
  assert.equal(calls, 3);
  assert.equal(r.data, 1);
});

test("para depois de 3 repetições (4 tentativas)", async () => {
  let calls = 0;
  await assert.rejects(retryRead(async () => { calls++; throw new TypeError("Failed to fetch"); }, { sleep: noSleep }));
  assert.equal(calls, 4);
});

test("intervalos 0,5 s / 1,5 s / 3 s", async () => {
  const waits: number[] = [];
  await assert.rejects(
    retryRead(async () => { throw { status: 503 }; }, { sleep: async (ms) => void waits.push(ms) }),
  );
  assert.deepEqual(waits, [500, 1500, 3000]);
});

test("não repete erro definitivo (400, 401, duplicidade)", async () => {
  for (const error of [{ status: 400 }, { status: 401 }, { code: "23505", message: "duplicate key" }]) {
    let calls = 0;
    await retryRead(async () => { calls++; return { data: null, error }; }, { sleep: noSleep });
    assert.equal(calls, 1);
  }
});

test("504 e timeout são transitórios", () => {
  assert.ok(isTransientError({ status: 504 }));
  assert.ok(isTransientError(new Error("timeout")));
});

test("mensagem ao usuário em português, sem termo técnico", () => {
  assert.equal(friendlyErrorMessage({ code: "PGRST002", message: "Could not query the database for the schema cache" }),
    "Sistema temporariamente indisponível. Tentando reconectar…");
  assert.equal(friendlyErrorMessage(new Error("Unexpected token")), "Não foi possível concluir agora.");
});
