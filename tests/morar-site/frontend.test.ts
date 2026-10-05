import test from "node:test";
import assert from "node:assert/strict";
import { brandFromPath, getSiteBrand, type SiteBrand } from "../../src/lib/cordial-site/brand";
import { mediaPath, propertyPath, sitePath } from "../../src/lib/cordial-site/presentation";
import { rewritePublicInput, rewritePublicOutput } from "../../src/lib/cordial-site/routing";
import { contactDraftKey } from "../../src/lib/cordial-site/contact-draft";
import { siteHead } from "../../src/lib/cordial-site/seo";

test("brand resolution is closed, with exact namespace boundaries", () => {
  assert.equal(brandFromPath("/site-morar/buscar"), "morar");
  assert.equal(brandFromPath("/site/imovel/id"), "cordial");
  assert.equal(brandFromPath("/site-administracao"), null);
  assert.equal(brandFromPath("/site-morar-administracao"), null);
  assert.throws(() => getSiteBrand("other" as SiteBrand));
});
test("public paths, image namespaces and browser state remain separate", () => {
  const property = { id: "7b3017eb-0ed6-4df7-846b-a7a9c4316fc5" };
  const media = { ...property, version: "a".repeat(32), position: 0, width: 800, height: 600 };
  assert.equal(sitePath("/buscar"), "/site/buscar");
  assert.equal(propertyPath(property, "morar"), `/site-morar/imovel/${property.id}`);
  assert.match(mediaPath(media, "card", "morar"), /^\/api\/morar-site\/media\//);
  assert.notEqual(getSiteBrand("cordial").favoritesKey, getSiteBrand("morar").favoritesKey);
  assert.notEqual(getSiteBrand("cordial").favoritesEvent, getSiteBrand("morar").favoritesEvent);
  assert.notEqual(
    contactDraftKey("contato", undefined, "cordial"),
    contactDraftKey("contato", undefined, "morar"),
  );
});
test("Morar SEO identifies its brand and preserves default Cordial titles", () => {
  const morar = siteHead(
    "Seu lar",
    "Descrição",
    undefined,
    "/site-morar",
    false,
    undefined,
    "morar",
  );
  assert.deepEqual(morar.meta[0], { title: "Seu lar | Morar Imóveis" });
  assert.deepEqual(siteHead("Início", "Descrição").meta[0], { title: "Início | Cordial Imóveis" });
  assert.equal(morar.links.length, 0);
  assert.ok(
    morar.meta.some((m) => "name" in m && m.name === "robots" && m.content === "noindex, nofollow"),
  );
});
test("Morar root activation is explicit and leaves Gestão namespaces intact", () => {
  assert.equal(rewritePublicInput(new URL("https://cordialgestao.com/imoveis")), undefined);
  assert.equal(
    rewritePublicInput(new URL("https://morar.example/buscar"), "morar.example", "morar")?.pathname,
    "/site-morar/buscar",
  );
  assert.equal(
    rewritePublicOutput(
      new URL("https://morar.example/site-morar/buscar"),
      "morar.example",
      "morar",
    )?.pathname,
    "/buscar",
  );
  assert.equal(
    rewritePublicOutput(new URL("https://morar.example/site/buscar"), "morar.example", "morar"),
    undefined,
  );
});
