import assert from "node:assert/strict";
import test from "node:test";
import { providerExternalCode } from "./provider-code.ts";

test("cada provedor recebe exclusivamente o seu código", () => {
  const property = { codigo_cordial: "1234", codigo_morar: "9876" };
  assert.equal(providerExternalCode(property, "cordial"), "1234");
  assert.equal(providerExternalCode(property, "morar"), "9876");
});

test("nunca usa o código do outro provedor como fallback", () => {
  assert.equal(providerExternalCode({ codigo_cordial: "1234", codigo_morar: null }, "morar"), null);
});

test("ignora valores vazios ou ausentes", () => {
  assert.equal(providerExternalCode({ codigo_cordial: "   " }, "cordial"), null);
  assert.equal(providerExternalCode(null, "cordial"), null);
});
