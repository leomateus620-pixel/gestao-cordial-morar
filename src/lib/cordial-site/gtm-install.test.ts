import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { gtmEventFor, gtmHeadScript, gtmNoscriptSrc, shouldInstallCordialGtm } from "./gtm-install";
import { isGtmId, loadGtm } from "./meta-pixel";

const ID = "GTM-N2GRRGRW";
const yes = (host: string, pathname = "/", containerId: string = ID) =>
  shouldInstallCordialGtm({ host, pathname, containerId });

test("installs on the Cordial public hosts", () => {
  for (const host of ["cordialimoveis.com", "www.cordialimoveis.com", "CordialImoveis.com:443"])
    for (const path of ["/", "/buscar", "/imovel/casa-x", "/site/buscar"])
      assert.equal(yes(host, path), true);
});

test("never installs on Morar, Gestão, previews or without a valid id", () => {
  for (const host of [
    "imobiliariamorarimoveis.com.br",
    "www.imobiliariamorarimoveis.com.br",
    "cordialgestao.com",
    "www.cordialgestao.com",
    "gestao-cordial-morar.lovable.app",
    "id-preview--x.lovable.app",
    "localhost:8080",
  ])
    assert.equal(yes(host), false, host);
  assert.equal(yes("cordialimoveis.com", "/site-morar"), false);
  assert.equal(yes("cordialimoveis.com", "/", ""), false);
  assert.equal(yes("cordialimoveis.com", "/", "GTM-x'</script>"), false);
});

test("official snippet: one gtm.js, consent denied first, one noscript", () => {
  assert.equal(isGtmId(ID), true);
  const js = gtmHeadScript(ID);
  assert.equal(js.split("googletagmanager.com/gtm.js").length - 1, 1);
  assert.ok(js.includes(`'dataLayer','${ID}'`));
  assert.ok(js.indexOf("'consent','default'") < js.indexOf("gtm.start"));
  assert.equal(gtmHeadScript("bad"), "");
  const html = renderToStaticMarkup(
    createElement("noscript", null, createElement("iframe", { src: gtmNoscriptSrc(ID) })),
  );
  assert.equal(html.split(`ns.html?id=${ID}`).length - 1, 1);
});

test("loadGtm adds no second script when the document tag exists", () => {
  let appended = 0;
  const w = {
    document: {
      querySelector: () => ({}),
      createElement: () => ({}),
      head: { appendChild: () => appended++ },
    },
  } as never;
  loadGtm(w, ID);
  assert.equal(appended, 0);
});

test("first-party events never become page_view", () => {
  assert.equal(gtmEventFor({ name: "page_view" }), null);
  assert.deepEqual(gtmEventFor({ name: "property_open", reference: "1441", email: "x" }), {
    event: "cordial_property_open",
    reference: "1441",
  });
});
