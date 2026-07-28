import assert from "node:assert/strict";
import test from "node:test";
import { brokerCanServeAgency } from "./broker-scope.ts";

const cordialOnly = {
  id: "1",
  nome: "Cordial",
  agencies: ["cordial"] as Array<"cordial" | "morar">,
};
const both = {
  id: "2",
  nome: "Ambas",
  agencies: ["cordial", "morar"] as Array<"cordial" | "morar">,
};

test("assignment options are limited to the attendance agency", () => {
  assert.equal(brokerCanServeAgency(cordialOnly, "cordial"), true);
  assert.equal(brokerCanServeAgency(cordialOnly, "morar"), false);
  assert.equal(brokerCanServeAgency(both, "morar"), true);
  assert.equal(brokerCanServeAgency(both, "ambas"), true);
});

test("missing or unknown memberships fail closed", () => {
  assert.equal(brokerCanServeAgency({ id: "3", nome: "Sem vínculo" }, "cordial"), false);
  assert.equal(brokerCanServeAgency(both, "todas"), false);
});
