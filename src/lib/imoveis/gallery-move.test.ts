import assert from "node:assert/strict";
import { test } from "node:test";
import { describeGalleryMove, rebaseGalleryMove } from "./gallery-move";

test("rebase preserves a concurrent addition while moving by stable anchors", () => {
  const move = describeGalleryMove(["a", "b", "c"], ["b", "a", "c"], "b");
  assert.ok(move);
  assert.deepEqual(rebaseGalleryMove(["a", "x", "b", "c"], move), {
    ok: true, orderedIds: ["b", "a", "x", "c"],
  });
});

test("rebase preserves a concurrent removal unrelated to the target", () => {
  const move = describeGalleryMove(["a", "b", "c", "d"], ["a", "c", "b", "d"], "b");
  assert.ok(move);
  assert.deepEqual(rebaseGalleryMove(["a", "b", "c"], move), {
    ok: true, orderedIds: ["a", "c", "b"],
  });
});

test("rebase refuses to resurrect a removed target or override another move", () => {
  const move = describeGalleryMove(["a", "b", "c"], ["b", "a", "c"], "b");
  assert.ok(move);
  assert.deepEqual(rebaseGalleryMove(["a", "c"], move), { ok: false, reason: "target_removed" });
  assert.deepEqual(rebaseGalleryMove(["a", "c", "b"], move), { ok: false, reason: "same_photo_changed" });
});

test("rebase refuses crossed anchors after a competing reorder", () => {
  const move = describeGalleryMove(["a", "b", "c", "d"], ["a", "c", "b", "d"], "b");
  assert.ok(move);
  assert.deepEqual(rebaseGalleryMove(["d", "a", "b", "c"], move), { ok: false, reason: "anchors_crossed" });
});
