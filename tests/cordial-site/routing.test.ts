import { test } from "node:test";
import assert from "node:assert/strict";
import { rewritePublicInput, rewritePublicOutput } from "../../src/lib/cordial-site/routing";
test("public-root rewriting is explicit and never moves administrative routes on the Gestão host", () => {
  const admin = new URL("https://gestao.example/imoveis");
  assert.equal(rewritePublicInput(admin, "site.example"), undefined);
  const publicUrl = new URL("https://site.example/buscar?finalidade=venda");
  assert.equal(rewritePublicInput(publicUrl, "site.example")?.pathname, "/site/buscar");
  assert.equal(rewritePublicInput(publicUrl, "site.example")?.search, "?finalidade=venda");
  assert.equal(
    rewritePublicInput(new URL("https://site.example/api/cordial-site/properties"), "site.example"),
    undefined,
  );
  assert.equal(
    rewritePublicOutput(new URL("https://site.example/site/imovel/example"), "site.example")
      ?.pathname,
    "/imovel/example",
  );
  assert.equal(rewritePublicInput(new URL("https://site.example/"), ""), undefined);
});
