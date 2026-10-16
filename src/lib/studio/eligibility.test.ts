import { test } from "node:test";
import assert from "node:assert/strict";
import { onlyEligible, eligibilityReason, canManageAllAgencyProjects, visibleStudioProjects, canApprove } from "./eligibility.ts";

test("onlyEligible filtra só existentes e elegíveis", () => {
  const items = [
    { id: "1", exists: true, eligible: true },
    { id: "2", exists: true, eligible: false },
    { id: "3", exists: false, eligible: true },
  ];
  assert.deepEqual(onlyEligible(items).map((i) => i.id), ["1"]);
});

test("eligibilityReason", () => {
  assert.equal(eligibilityReason({ id: "1", exists: false, eligible: false }), "nao_encontrado");
  assert.equal(eligibilityReason({ id: "1", exists: true, eligible: false }), "nao_elegivel");
  assert.equal(eligibilityReason({ id: "1", exists: true, eligible: true }), "ok");
});

test("visibilidade por papel", () => {
  const rows = [{ owner_id: "a" }, { owner_id: "b" }];
  assert.equal(canManageAllAgencyProjects(["corretor"]), false);
  assert.equal(canManageAllAgencyProjects(["admin"]), true);
  assert.deepEqual(visibleStudioProjects(rows, "a", ["corretor"]), [{ owner_id: "a" }]);
  assert.deepEqual(visibleStudioProjects(rows, "a", ["admin"]), rows);
});

test("canApprove", () => {
  assert.equal(canApprove(["corretor"], "a", "a"), true);
  assert.equal(canApprove(["corretor"], "a", "b"), false);
  assert.equal(canApprove(["admin"], "a", "b"), true);
});
