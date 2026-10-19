import { test } from "node:test";
import assert from "node:assert/strict";
import { changeTourView, initialTourView } from "../../src/lib/cordial-site/tour-view";
test("panorama controls wrap the horizon and keep pitch and magnification within inspection limits", () => {
  assert.deepEqual(changeTourView(initialTourView, { yaw: -15, pitch: 10, fov: -5 }), {
    yaw: 345,
    pitch: 10,
    fov: 70,
  });
  assert.equal(changeTourView(initialTourView, { yaw: 1080 }).yaw, 0);
  assert.equal(changeTourView(initialTourView, { pitch: 1000 }).pitch, 80);
  assert.equal(changeTourView(initialTourView, { pitch: -1000 }).pitch, -80);
  assert.equal(changeTourView(initialTourView, { fov: -1000 }).fov, 35);
  assert.equal(changeTourView(initialTourView, { fov: 1000 }).fov, 100);
  assert.deepEqual(initialTourView, { yaw: 0, pitch: 0, fov: 75 });
});
