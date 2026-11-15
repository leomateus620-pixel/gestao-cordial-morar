import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTone,
  tonePlanSchema,
  rotateFeatured,
  featuredAdapter,
} from "../../src/lib/site-showcase/featured";
import { mediaPath } from "../../src/lib/cordial-site/presentation";

const neutral = {
  exposure: 0,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  shadows: 0,
  sharpness: 0,
  reason: "Foto equilibrada.",
};
test("faithful treatment preserves dimensions, alpha, originals and neutral pixels", () => {
  const data = new Uint8Array(4 * 9);
  for (let i = 0; i < data.length; i++) data[i] = (i * 67) % 256;
  const original = data.slice(),
    result = applyTone({ width: 3, height: 3, data }, neutral);
  assert.deepEqual(result, { width: 3, height: 3, data: original });
  assert.notEqual(result.data, data);
  const enhanced = applyTone(
    { width: 3, height: 3, data },
    { ...neutral, exposure: 0.3, shadows: 0.03, sharpness: 0.2 },
  );
  assert.deepEqual(data, original);
  assert.equal(enhanced.width, 3);
  assert.equal(enhanced.height, 3);
  for (let i = 3; i < data.length; i += 4) assert.equal(enhanced.data[i], original[i]);
  assert.deepEqual(
    enhanced,
    applyTone(
      { width: 3, height: 3, data },
      { ...neutral, exposure: 0.3, shadows: 0.03, sharpness: 0.2 },
    ),
  );
});
test("tone opens midtones while retaining black and white endpoints and rejects excessive changes", () => {
  const data = Uint8Array.from([0, 0, 0, 255, 80, 80, 80, 255, 255, 255, 255, 255]);
  const treated = applyTone({ width: 3, height: 1, data }, { ...neutral, exposure: 0.3 });
  assert.equal(treated.data[0], 0);
  assert.ok(treated.data[4] > 80);
  assert.equal(treated.data[8], 255);
  for (const patch of [
    { exposure: 1 },
    { saturation: 2 },
    { sharpness: 1 },
    { warmth: 0.1 },
    { crop: true },
  ])
    assert.equal(tonePlanSchema.safeParse({ ...neutral, ...patch }).success, false);
});
test("weekly rotation avoids recent properties, duplicate IDs and missing covers", () => {
  const p = (id: string, cover: unknown = true) => ({ id, cover, publishedAt: "2026-11-14" });
  assert.deepEqual(
    rotateFeatured(
      [p("a"), p("b"), p("b"), p("c", null), p("d"), p("e"), p("f"), p("g")],
      ["a"],
    ).map((p) => p.id),
    ["b", "d", "e", "f", "g"],
  );
  assert.deepEqual(
    rotateFeatured([p("a"), p("b")], ["a"]).map((p) => p.id),
    ["b", "a"],
  );
  assert.notEqual(featuredAdapter("cordial").bucket, featuredAdapter("morar").bucket);
});
test("treated photos have immutable, separate responsive URLs", () => {
  const photo = {
    id: "00000000-0000-4000-8000-000000000001",
    version: "a".repeat(32),
    width: 1920,
    height: 1080,
    position: 0,
  };
  const original = mediaPath(photo, "card", "morar");
  assert.equal(
    mediaPath({ ...photo, enhancement: "b".repeat(64) }, "card", "morar"),
    original + "?enhancement=" + "b".repeat(64),
  );
  assert.notEqual(mediaPath({ ...photo, enhancement: "b".repeat(64) }, "thumb", "morar"), original);
});
