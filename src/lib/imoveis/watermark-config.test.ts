import test from "node:test";
import assert from "node:assert/strict";
import { destinationHash, variantForTargets } from "./watermark-config";

test("marca segue a escolha de Cordial, Morar ou ambas", () => {
  assert.equal(variantForTargets(["cordial"]), "cordial");
  assert.equal(destinationHash(["cordial"]), "cordial@v2");
  assert.equal(variantForTargets(["morar"]), "morar");
  assert.equal(destinationHash(["morar"]), "morar@v2");
  assert.equal(variantForTargets(["morar", "cordial", "morar"]), "morar-cordial");
  assert.equal(destinationHash(["morar", "cordial"]), "morar-cordial@v2");
  assert.equal(variantForTargets([]), "morar-cordial");
});
