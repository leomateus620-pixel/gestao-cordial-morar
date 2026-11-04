import assert from "node:assert/strict";
import test from "node:test";
import { uploadAndRegister } from "./upload-document.ts";

function fake(opts: { storedAfterFail?: boolean; failTimes?: number }) {
  const store = new Set<string>();
  const registered: string[] = [];
  let uploads = 0;
  let fails = opts.failTimes ?? 0;
  return {
    store, registered, get uploads() { return uploads; },
    deps: {
      upload: async (p: string) => {
        uploads++;
        if (fails > 0) { fails--; if (opts.storedAfterFail) store.add(p); return { error: { message: "HTTP 504 error", statusCode: 504 } }; }
        store.add(p); return { error: null };
      },
      exists: async (p: string) => store.has(p),
      register: async (p: string) => { if (!registered.includes(p)) registered.push(p); return p; },
    },
  };
}

test("504 com arquivo gravado: registra sem reenviar", async () => {
  const f = fake({ storedAfterFail: true, failTimes: 1 });
  await uploadAndRegister("c/a.docx", new Blob(["x"]), "x", f.deps);
  assert.equal(f.uploads, 1);
  assert.deepEqual(f.registered, ["c/a.docx"]);
});

test("504 sem gravar: tenta mais uma vez e registra", async () => {
  const f = fake({ failTimes: 1 });
  await uploadAndRegister("c/a.docx", new Blob(["x"]), "x", f.deps);
  assert.equal(f.uploads, 2);
  assert.deepEqual(f.registered, ["c/a.docx"]);
});

test("nova tentativa com mesmo caminho não reenvia nem duplica", async () => {
  const f = fake({});
  await uploadAndRegister("c/a.docx", new Blob(["x"]), "x", f.deps);
  await uploadAndRegister("c/a.docx", new Blob(["x"]), "x", f.deps);
  assert.equal(f.uploads, 1);
  assert.equal(f.registered.length, 1);
});

test("duas falhas seguidas: erro, nada registrado", async () => {
  const f = fake({ failTimes: 2 });
  await assert.rejects(uploadAndRegister("c/a.docx", new Blob(["x"]), "x", f.deps));
  assert.equal(f.registered.length, 0);
});
