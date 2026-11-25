import assert from "node:assert/strict";
import test from "node:test";
import { checkDeviceStorage, isQuotaLow } from "./storage-persist";

const MB = 1024 * 1024;
test("aviso com menos de 200 MB livres ou mais de 90% usado", () => {
  assert.equal(isQuotaLow({ quota: 1000 * MB, usage: 850 * MB }), true);
  assert.equal(isQuotaLow({ quota: 10000 * MB, usage: 9100 * MB }), true);
  assert.equal(isQuotaLow({ quota: 1000 * MB, usage: 100 * MB }), false);
  assert.equal(isQuotaLow(null), false);
});
test("pede persistência uma vez só", async () => {
  let asked = 0;
  const kv = new Map<string, string>();
  const store = { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => void kv.set(k, v) };
  const sm = { persist: async () => (asked++, true), persisted: async () => false, estimate: async () => ({ quota: 1e10, usage: 0 }) };
  assert.equal(await checkDeviceStorage(sm, store), false);
  await checkDeviceStorage(sm, store);
  assert.equal(asked, 1);
});
