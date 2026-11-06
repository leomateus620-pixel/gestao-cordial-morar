import { test } from "node:test";
import assert from "node:assert/strict";
import { imobiIntegrationEnabled } from "./integration-switch";
import { ImobiApiError } from "./errors";

test("ImobiBrasil fica OFF por padrão, mesmo com token presente", () => {
  process.env.IMOBI_TEST_TOKEN = "x";
  assert.equal(imobiIntegrationEnabled(), false);
});

test("erro de integração desligada não é repetível", () => {
  const e = new ImobiApiError({ message: "off", category: "disabled" });
  assert.equal(e.retryable, false);
});
