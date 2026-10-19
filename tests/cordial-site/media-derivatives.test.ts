import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDerivative,
  checksum,
  derivativeKey,
  type DerivativeStore,
} from "../../src/lib/cordial-site/media-derivatives.server";
const jpeg = () => Uint8Array.from([255, 216, ...Array(32).fill(5), 255, 217]);
function store() {
  let entry: { bytes: Uint8Array; checksum: string } | null = null;
  let leased = false;
  let published = 0;
  const api: DerivativeStore = {
    read: async () => entry,
    claim: async () => (leased ? null : ((leased = true), "lease")),
    publish: async (_k, _l, bytes, hash) => {
      entry = { bytes, checksum: hash };
      published++;
    },
    invalidate: async () => {
      entry = null;
      leased = false;
    },
    release: async () => {
      leased = false;
    },
  };
  return {
    api,
    get published() {
      return published;
    },
    set corrupt(value: boolean) {
      if (value) entry = { bytes: jpeg(), checksum: "wrong" };
    },
  };
}
test("concurrent requests generate once and a warm read never decodes the original", async () => {
  const s = store();
  let generated = 0;
  const generate = async () => {
    generated++;
    await new Promise((r) => setTimeout(r, 15));
    return jpeg();
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => resolveDerivative("concurrency", s.api, generate)),
  );
  assert.equal(generated, 1);
  assert.equal(s.published, 1);
  assert.ok(results.every((r) => r === results[0]));
  await resolveDerivative("concurrency", s.api, async () => {
    throw new Error("must not decode");
  });
  assert.equal(generated, 1);
});
test("corrupted persisted checksum is rebuilt and failed generation releases the lease", async () => {
  const s = store();
  s.corrupt = true;
  const output = await resolveDerivative("repair", s.api, async () => jpeg());
  assert.equal(await checksum(output), await checksum(jpeg()));
  assert.equal(s.published, 1);
  const failed = store();
  await assert.rejects(
    resolveDerivative("failed", failed.api, async () => {
      throw new Error("bad input");
    }),
  );
  await resolveDerivative("failed", failed.api, async () => jpeg());
  assert.equal(failed.published, 1);
});
test("derived identity isolates brands, source revisions, size and transformer", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const a = derivativeKey("cordial", id, "a".repeat(32), "card");
  assert.notEqual(a, derivativeKey("morar", id, "a".repeat(32), "card"));
  assert.notEqual(a, derivativeKey("cordial", id, "b".repeat(32), "card"));
  assert.notEqual(a, derivativeKey("cordial", id, "a".repeat(32), "full"));
  assert.ok(a.endsWith("960-jpeg-q80-purejs-v2.jpg"));
});
