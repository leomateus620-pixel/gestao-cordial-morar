import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSidebarPreference,
  serializeSidebarPreference,
  SIDEBAR_PREFERENCE_KEY,
} from "./sidebar-preference.ts";

test("serializes and restores only the supported sidebar preference", () => {
  assert.equal(SIDEBAR_PREFERENCE_KEY, "gc.sidebar.collapsed.v1");
  assert.equal(serializeSidebarPreference(true), "collapsed");
  assert.equal(serializeSidebarPreference(false), "expanded");
  assert.equal(parseSidebarPreference("collapsed"), true);
  assert.equal(parseSidebarPreference("expanded"), false);
  assert.equal(parseSidebarPreference(null), false);
  assert.equal(parseSidebarPreference("invalid"), false);
});
