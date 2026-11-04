import assert from "node:assert/strict";
import test from "node:test";
import { showcaseAdapter } from "./brand-adapter.ts";

test("morar showcase never touches cordial tables, bucket or RPCs", () => {
  const a = showcaseAdapter("morar");
  const all = [a.settings, a.weeks, a.attempts, a.eligible, a.media, a.bucket, ...Object.values(a.rpc)];
  assert.equal(all.some((n) => n.includes("cordial")), false);
  assert.equal(a.bucket, "morar-showcase");
  assert.equal(a.rpc.activate, "morar_site_showcase_activate");
});

test("cordial adapter keeps the existing names", () => {
  const a = showcaseAdapter("cordial");
  assert.equal(a.weeks, "cordial_site_showcase_weeks");
  assert.equal(a.bucket, "cordial-showcase");
});

test("unknown brand is rejected", () => {
  assert.throws(() => showcaseAdapter("outra" as never));
});
