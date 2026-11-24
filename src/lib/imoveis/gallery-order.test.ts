import assert from "node:assert/strict";
import { test } from "node:test";
import { describeGalleryMove } from "./gallery-move";
import {
  applyGalleryEdits,
  createGalleryOrderQueue,
  galleryUploadKey,
  mergeGallerySlots,
  type GalleryEdit,
  type GalleryOrderSnapshot,
} from "./gallery-order";

function snapshot(revision: number, keys: string[], activeKeys = keys): GalleryOrderSnapshot {
  return { revision, keys, activeKeys };
}

function move(base: string[], keys: string[], imageId: string): GalleryEdit {
  const change = describeGalleryMove(base, keys, imageId);
  assert.ok(change);
  return { type: "move", move: change };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("reserved photos keep selection and batch order through out-of-order processing", () => {
  const selection = Array.from({ length: 15 }, (_, index) => String(index + 1));
  let keys = applyGalleryEdits(snapshot(1, [], []), [
    { type: "append", keys: selection },
    { type: "append", keys: ["16", "17"] },
  ]);
  assert.deepEqual(keys, [...selection, "16", "17"]);
  const selectedCover = keys[14]!;
  keys = applyGalleryEdits(snapshot(2, keys, ["2", "3", "5"]), [
    move(keys, [selectedCover, ...keys.filter((key) => key !== selectedCover)], selectedCover),
    { type: "discard", key: "16" },
    { type: "discard", key: "3" },
  ]);
  assert.equal(keys[0], "15");
  assert.ok(!keys.includes("16"), "a failed or duplicate slot is discarded");
  assert.ok(keys.includes("3"), "discard cannot remove a photo already registered");
  assert.deepEqual(mergeGallerySlots(["2", "3", "5"], keys), keys);
  assert.deepEqual(mergeGallerySlots(["15", "2", "3", "5", "17"], keys), keys);
});

test("a background insertion and a stale read preserve rapid ID moves and the cover on reload", async () => {
  let db = snapshot(1, ["a", "b", "c", "d"]);
  let calls = 0;
  const queue = createGalleryOrderQueue(async (edits) => {
    calls += 1;
    const keys = applyGalleryEdits(db, edits);
    return (db = snapshot(db.revision + 1, keys));
  });
  queue.receive(db);
  queue.enqueue(move(["a", "b", "c", "d"], ["a", "c", "b", "d"], "b"));
  queue.enqueue(move(["a", "c", "b", "d"], ["a", "c", "d", "b"], "b"));
  queue.enqueue(move(["a", "c", "d", "b"], ["d", "a", "c", "b"], "d"));
  assert.deepEqual(queue.getSnapshot().keys, ["d", "a", "c", "b"]);
  const older = db;
  db = snapshot(2, ["a", "b", "c", "d", "new"]);
  queue.receive(db);
  assert.deepEqual(queue.getSnapshot().keys, ["d", "a", "c", "b", "new"]);
  await queue.flush();
  queue.receive(older);
  assert.equal(calls, 1);
  assert.equal(queue.getSnapshot().status, "saved");
  assert.deepEqual(queue.getSnapshot().keys, ["d", "a", "c", "b", "new"]);
  const reopened = createGalleryOrderQueue(async () => db);
  reopened.receive(db);
  assert.deepEqual(reopened.getSnapshot().keys, ["d", "a", "c", "b", "new"]);
});

test("an old failure cannot roll back a more recent move and concurrent flushes share a write", async () => {
  let db = snapshot(1, ["a", "b", "c", "d"]);
  let calls = 0;
  const pending = deferred<GalleryOrderSnapshot>();
  const queue = createGalleryOrderQueue(async (edits) => {
    calls += 1;
    if (calls === 1) return pending.promise;
    return (db = snapshot(2, applyGalleryEdits(db, edits)));
  });
  queue.receive(db);
  queue.enqueue(move(db.keys, ["b", "a", "c", "d"], "b"));
  const exit = queue.flush();
  queue.enqueue(move(["b", "a", "c", "d"], ["b", "a", "d", "c"], "d"));
  const submit = queue.flush();
  assert.equal(exit, submit);
  pending.reject(new Error("old transport error"));
  await exit;
  assert.deepEqual(queue.getSnapshot(), { keys: ["b", "a", "d", "c"], status: "saved" });
  assert.equal(calls, 2);
});

test("a current failure leaves the chosen order visible and retryable against new photos", async () => {
  let db = snapshot(1, ["a", "b", "c"]);
  const queue = createGalleryOrderQueue(async (edits, retry) => {
    if (!retry) throw new Error("offline");
    return (db = snapshot(3, applyGalleryEdits(db, edits)));
  });
  queue.receive(db);
  queue.enqueue(move(db.keys, ["c", "a", "b"], "c"));
  await assert.rejects(queue.flush(), /offline/);
  db = snapshot(2, ["a", "b", "c", "d"]);
  queue.receive(db);
  assert.deepEqual(queue.getSnapshot(), { keys: ["c", "a", "b", "d"], status: "error" });
  assert.equal(queue.hasPending(), true);
  await queue.flush();
  assert.equal(queue.hasPending(), false);
  assert.deepEqual(db.keys, ["c", "a", "b", "d"]);
});

test("a photo joins its reserved identity without changing the stable order", () => {
  const key = "00000000-0000-4000-8000-000000000001";
  assert.equal(galleryUploadKey(`property/originais/galeria-${key}-blob-something.jpg`), key);
  assert.equal(galleryUploadKey(`property/originais/galeria-${key}x-bad.jpg`), undefined);
  assert.equal(galleryUploadKey(`property/originais/${key}-legado.jpg`), undefined);
  assert.deepEqual(mergeGallerySlots(["b", "a"], ["a", key, "b"]), [key, "b", "a"]);
});
