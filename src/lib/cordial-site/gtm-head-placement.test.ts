import { test } from "node:test";
import assert from "node:assert/strict";
import { placeCordialGtmAtHeadTop } from "./gtm-head-placement";
import { gtmHeadScript } from "./gtm-install";

const ID = "GTM-N2GRRGRW";
const SCRIPT = `<script data-gtm="cordial">${gtmHeadScript(ID)}</script>`;
const NOSCRIPT = `<noscript data-gtm="cordial"><iframe src="x"></iframe></noscript>`;
const prod = `<!DOCTYPE html><html lang="pt-BR"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><link rel="preload" href="/f.woff2" as="font"/><link rel="stylesheet" href="/a.css"/><title>Cordial</title><meta property="og:title" content="C"/><link rel="modulepreload" href="/m.js"/><link rel="canonical" href="https://cordialimoveis.com/"/>${SCRIPT}<script type="application/ld+json">{}</script></head><body>${NOSCRIPT}<div id="app"></div></body></html>`;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const headOf = (s: string) => s.slice(s.indexOf("<head>") + 6, s.indexOf("</head>"));

test("moves the GTM script right after the charset, before every other head tag", () => {
  const out = placeCordialGtmAtHeadTop(prod);
  assert.ok(headOf(out).startsWith(`<meta charSet="utf-8"/>${SCRIPT}<meta name="viewport"`));
  assert.equal(count(out, /<script data-gtm="cordial">/g), 1);
  assert.equal(count(out, /<noscript data-gtm="cordial">/g), 1);
  assert.ok(out.includes(`<body>${NOSCRIPT}`));
  assert.ok(out.indexOf("'consent','default'") < out.indexOf("gtm.start"));
  assert.ok(out.includes("analytics_storage:'denied'"));
  assert.ok(!out.includes("gtag/js"));
});

test("html without GTM and without id is untouched", () => {
  const morar = prod.replace(SCRIPT, "").replace(NOSCRIPT, "");
  assert.equal(placeCordialGtmAtHeadTop(morar), morar);
});

test("inserts once when missing and the id is valid; never with an invalid id", () => {
  const bare = prod.replace(SCRIPT, "").replace(NOSCRIPT, "");
  const out = placeCordialGtmAtHeadTop(bare, { id: ID });
  assert.ok(headOf(out).startsWith(`<meta charSet="utf-8"/>${SCRIPT}`));
  assert.equal(count(out, /<noscript data-gtm="cordial">/g), 1);
  assert.ok(out.includes('<body><noscript data-gtm="cordial">'));
  assert.equal(placeCordialGtmAtHeadTop(bare, { id: "G-ABC" }), bare);
});

test("idempotent and collapses duplicates", () => {
  const once = placeCordialGtmAtHeadTop(prod);
  assert.equal(placeCordialGtmAtHeadTop(once), once);
  assert.equal(placeCordialGtmAtHeadTop(once, { id: ID }), once);
  const dup = prod.replace("</head>", `${SCRIPT}</head>`);
  assert.equal(placeCordialGtmAtHeadTop(dup), once);
});
