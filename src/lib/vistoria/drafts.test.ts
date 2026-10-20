import assert from "node:assert/strict";
import test from "node:test";
import { DraftController } from "./draft-controller";
import {
  conflictingFields,
  displacedDraft,
  draftKey,
  mergeDraft,
  type DraftEntry,
  type DraftScope,
} from "./draft-model";
import { transactionResult } from "./local-store";
const scope: DraftScope = {
  userId: "user-a",
  inspectionId: "inspection-a",
  roomId: "sala",
  entity: "item",
  entityId: "piso",
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function memory() {
  const entries = new Map<string, DraftEntry>();
  return {
    entries,
    put: async (e: DraftEntry) => {
      entries.set(e.key, structuredClone(e));
    },
    remove: async (k: string) => {
      entries.delete(k);
    },
  };
}
test("request IndexedDB bem-sucedido ainda não confirma a transação", async () => {
  const t = { error: null } as unknown as IDBTransaction,
    r = { result: "ok", error: null } as unknown as IDBRequest<string>;
  let closed = false,
    done = false;
  const p = transactionResult(t, r, () => {
    closed = true;
  });
  void p.then(() => (done = true));
  r.onsuccess?.({} as Event);
  await tick();
  assert.equal(done, false);
  t.oncomplete?.({} as Event);
  assert.equal(await p, "ok");
  assert.equal(closed, true);
});
test("abort após sucesso do object store rejeita a persistência", async () => {
  const t = { error: new Error("quota") } as unknown as IDBTransaction,
    r = { result: "ok", error: null } as unknown as IDBRequest<string>;
  const p = transactionResult(t, r, () => {});
  r.onsuccess?.({} as Event);
  t.onabort?.({} as Event);
  await assert.rejects(p, /quota/);
});
test("digitação sem blur só pode ir à rede depois do commit local", async () => {
  const gate = deferred<void>(),
    store = memory();
  let calls = 0;
  const c = new DraftController(
    {
      ...store,
      put: async (e) => {
        await gate.promise;
        await store.put(e);
      },
    },
    async () => {
      calls++;
      return 2;
    },
    () => true,
  );
  c.edit(scope, { revision: 1, damage: null }, { damage: "Trinca observada" });
  const flush = c.flush();
  await tick();
  assert.equal(calls, 0);
  assert.equal(c.snapshot()[draftKey(scope)].status, "persisting");
  gate.resolve();
  await flush;
  assert.equal(calls, 1);
  assert.equal(c.snapshot()[draftKey(scope)], undefined);
  c.stop();
});
test("digitar durante save preserva a geração nova e serializa os envios", async () => {
  const gate = deferred<number>(),
    store = memory(),
    sent: string[] = [];
  const c = new DraftController(
    store,
    async (e) => {
      sent.push(e.patch.damage as string);
      return sent.length === 1 ? gate.promise : 3;
    },
    () => true,
  );
  c.edit(scope, { revision: 1, damage: null }, { damage: "primeiro" });
  const first = c.flush();
  await tick();
  c.edit(scope, { revision: 1, damage: null }, { damage: "segundo sem blur" });
  gate.resolve(2);
  await first;
  await c.flush();
  assert.deepEqual(sent, ["primeiro", "segundo sem blur"]);
  assert.equal(store.entries.size, 0);
  c.stop();
});
test("outro campo editado enquanto a fila envia não é substituído por snapshot antigo", async () => {
  const gate = deferred<number>(),
    store = memory(),
    sent: string[] = [];
  const other = { ...scope, entityId: "parede" };
  const c = new DraftController(
    store,
    async (e) => {
      sent.push(e.patch.notes as string);
      return sent.length === 1 ? gate.promise : 3;
    },
    () => true,
  );
  c.edit(scope, { revision: 1 }, { notes: "a" });
  c.edit(other, { revision: 1 }, { notes: "b" });
  const first = c.flush();
  await tick();
  c.edit(other, { revision: 1 }, { notes: "b atualizado" });
  await tick();
  gate.resolve(2);
  await first;
  await c.flush();
  assert.deepEqual(sent, ["a", "b atualizado"]);
  c.stop();
});
test("offline, recarga, conta, vistoria e ambiente mantêm contextos separados", async () => {
  const store = memory();
  const c = new DraftController(
    store,
    async () => 2,
    () => false,
  );
  c.edit({ ...scope, entity: "narrative" }, {}, { text: "Sala" });
  c.edit({ ...scope, roomId: "cozinha", entity: "narrative" }, {}, { text: "Cozinha" });
  await c.flush();
  assert.equal(store.entries.size, 2);
  const restored = new DraftController(
    store,
    async () => 2,
    () => false,
  );
  restored.hydrate([...store.entries.values()]);
  assert.deepEqual(
    Object.values(restored.snapshot())
      .map((v) => v.entry.patch.text)
      .sort(),
    ["Cozinha", "Sala"],
  );
  assert.notEqual(draftKey(scope), draftKey({ ...scope, userId: "user-b" }));
  assert.notEqual(draftKey(scope), draftKey({ ...scope, inspectionId: "inspection-b" }));
  c.stop();
  restored.stop();
});
test("quota bloqueia rede e não é rotulada como salva no aparelho", async () => {
  let calls = 0;
  const c = new DraftController(
    {
      put: async () => {
        throw new Error("quota");
      },
      remove: async () => {},
    },
    async () => {
      calls++;
      return 2;
    },
    () => true,
  );
  c.edit(scope, { revision: 1 }, { notes: "não perder" });
  await c.flush();
  assert.equal(calls, 0);
  assert.equal(c.snapshot()[draftKey(scope)].status, "error");
  assert.equal(c.snapshot()[draftKey(scope)].entry.patch.notes, "não perder");
  c.stop();
});
test("refetch/IA não substituem rascunho; conflito exige decisão", () => {
  const e = mergeDraft(undefined, scope, { revision: 1, notes: "original" }, { notes: "local" });
  assert.deepEqual(conflictingFields(e, { revision: 2, notes: "IA ou outra aba" }), ["notes"]);
  assert.equal(e.patch.notes, "local");
  assert.deepEqual(conflictingFields(e, { revision: 2, notes: "original", color: "azul" }), []);
});
test("duas abas preservam as duas versões duráveis e a recuperação exige decisão", async () => {
  const a = {
    ...mergeDraft(undefined, scope, { revision: 1, notes: "original" }, { notes: "versão A" }),
    writerId: "aba-a",
  };
  const b = {
    ...mergeDraft(undefined, scope, { revision: 1, notes: "original" }, { notes: "versão B" }),
    writerId: "aba-b",
  };
  const recovery = displacedDraft(a, b)!;
  assert.equal(recovery.patch.notes, "versão A");
  assert.notEqual(recovery.key, b.key);
  assert.equal(displacedDraft(b, { ...b, generation: "seguinte" }), null);
  assert.equal(displacedDraft(a, { ...a, writerId: "outra-aba" }), null);
  const c = new DraftController(
    memory(),
    async () => 2,
    () => true,
  );
  c.hydrate([b, recovery]);
  assert.equal(c.snapshot()[recovery.key].status, "conflict");
  await c.flush();
  assert.equal(c.snapshot()[recovery.key].entry.patch.notes, "versão A");
  c.stop();
});
test("retomar relato recuperado mantém o outro texto e o ambiente de origem", async () => {
  const original = mergeDraft(
    undefined,
    { ...scope, entity: "narrative", entityId: "narrative:piso" },
    {},
    { text: "Sala A", clientKey: "a" },
  );
  const alternate = {
    ...mergeDraft(undefined, original, {}, { text: "Sala B", clientKey: "b" }),
    key: original.key + "~b",
    recovered: true,
  };
  const store = memory(),
    c = new DraftController(
      store,
      async () => 2,
      () => false,
    );
  c.hydrate([original, alternate]);
  await c.restoreEditor(alternate.key);
  assert.equal(c.snapshot()[original.key].entry.patch.text, "Sala B");
  assert.equal(c.snapshot()[original.key].entry.roomId, "sala");
  assert.ok(
    Object.values(c.snapshot()).some(
      (v) => v.entry.patch.text === "Sala A" && v.status === "conflict",
    ),
  );
  c.stop();
});
test("nome de novo item fica local e separado por ambiente até confirmar a inclusão", async () => {
  const store = memory();
  let calls = 0;
  const c = new DraftController(
    store,
    async () => {
      calls++;
      return 2;
    },
    () => true,
  );
  const itemScope = { ...scope, entity: "new-item" as const };
  c.edit(itemScope, { name: "" }, { name: "Ar-condicionado da Sala" });
  c.edit({ ...itemScope, roomId: "cozinha" }, { name: "" }, { name: "Armário da Cozinha" });
  await c.flush();
  assert.equal(calls, 0);
  assert.equal(c.snapshot()[draftKey(itemScope)].entry.patch.name, "Ar-condicionado da Sala");
  assert.equal(store.entries.size, 2);
  c.stop();
});
test("remoção confirmada cancela rascunhos do ambiente sem atingir outro", async () => {
  const store = memory(),
    c = new DraftController(
      store,
      async () => 2,
      () => false,
    );
  c.edit(scope, {}, { notes: "a" });
  c.edit({ ...scope, roomId: "cozinha" }, {}, { notes: "b" });
  await c.flush();
  await c.discardRoom("sala");
  assert.equal(store.entries.size, 1);
  assert.equal([...store.entries.values()][0].roomId, "cozinha");
  c.stop();
});
test("envio manual também aguarda confirmação local e rejeita quota", async () => {
  const c = new DraftController(
    {
      put: async () => {
        throw new Error("quota");
      },
      remove: async () => {},
    },
    async () => 2,
    () => true,
  );
  c.edit({ ...scope, entity: "narrative" }, {}, { text: "relato sem rede" });
  await assert.rejects(c.ensureLocal(), /quota/);
  c.stop();
});
test("pausa de ambiente espera o envio corrente e impede novos envios até decisão", async () => {
  const store = memory();
  let calls = 0;
  const gate = deferred<number>();
  const c = new DraftController(
    store,
    async () => {
      calls++;
      return gate.promise;
    },
    () => true,
  );
  c.edit(scope, { revision: 1 }, { notes: "a" });
  const send = c.flush();
  await tick();
  const pause = c.pauseRoom("sala");
  gate.resolve(2);
  await send;
  await pause;
  c.edit(scope, { revision: 2 }, { notes: "preservar até remoção confirmada" });
  await c.flush();
  assert.equal(calls, 1);
  await c.discardRoom("sala");
  assert.equal(c.snapshot()[draftKey(scope)], undefined);
  c.stop();
});
