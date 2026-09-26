import { test } from "node:test";
import assert from "node:assert/strict";
import {
  searchSchema,
  leadSchema,
  searchParams,
  settingsSchema,
} from "../../src/lib/cordial-site/contract";
import { plainText, priceLabel, safeJsonLd } from "../../src/lib/cordial-site/presentation";
test("validates intervals, bounded pages, integer rooms and literal strings", () => {
  assert.equal(searchSchema.safeParse({ pagina: -1 }).success, false);
  assert.equal(searchSchema.safeParse({ precoMin: 100, precoMax: 20 }).success, false);
  assert.equal(searchSchema.safeParse({ dormitorios: 1.2 }).success, false);
  assert.equal(searchSchema.safeParse({ precoMin: Infinity }).success, false);
  assert.equal(searchSchema.parse({ precoMin: "", precoMax: null }).precoMin, undefined);
  assert.equal(searchSchema.parse({ referencia: "x);drop table" }).referencia, "x);drop table");
  assert.equal(searchSchema.parse({ carteira: "morar" }).finalidade, undefined);
});
test("filters round-trip in shared URLs, preserving meaningful null and false states", () => {
  const q = searchSchema.parse({
    finalidade: "aluguel",
    precoMin: 0,
    mobiliado: "nao",
    areaTipo: "terreno",
    pagina: 2,
  });
  assert.deepEqual(searchSchema.parse(Object.fromEntries(new URLSearchParams(searchParams(q)))), q);
});
test("contact requires explicit consent, durable request identity and bounded campaign allowlist", () => {
  const v = {
    requestId: "00000000-0000-4000-8000-000000000001",
    name: "Maria",
    phone: "55999999999",
    message: "Quero mais informações",
    kind: "contato",
    consent: true,
    entryPath: "/site/contato",
  };
  assert.equal(leadSchema.safeParse(v).success, true);
  assert.equal(leadSchema.safeParse({ ...v, consent: false }).success, false);
  assert.equal(leadSchema.safeParse({ ...v, kind: "interesse" }).success, false);
  assert.equal(leadSchema.safeParse({ ...v, website: "spam" }).success, false);
  assert.equal(leadSchema.safeParse({ ...v, entryPath: "//evil.com" }).success, false);
  assert.deepEqual(
    leadSchema.parse({ ...v, campaign: { utm_source: "search", secret: "forbidden" } }).campaign,
    { utm_source: "search" },
  );
});
test("renders plain text and JSON-LD safely without inventing missing prices", () => {
  assert.equal(plainText("<p>Casa</p><script>alert(1)</script><p>Clara</p>"), "Casa\nClara");
  assert.ok(!safeJsonLd({ text: "</script><script>alert(1)" }).includes("<"));
  assert.equal(
    priceLabel({ price: 123, priceMode: "consulte", operation: "venda" }),
    "Valor sob consulta",
  );
  assert.equal(
    priceLabel({ price: null, priceMode: "fixo", operation: "aluguel" }),
    "Valor não informado",
  );
});

test("empty or invalid settings never throw outside Zod validation", () => {
  assert.equal(settingsSchema.parse({}).instagram, "");
  assert.equal(settingsSchema.safeParse({ instagram: "bad" }).success, false);
  assert.equal(
    settingsSchema.safeParse({ links: [{ label: "Bank", url: "http://insecure.example" }] })
      .success,
    false,
  );
});

test("clearing optional enum filters returns to valid default semantics", () => {
  const parsed = searchSchema.parse({
    finalidade: "",
    mobiliado: "",
    permuta: "",
    financiamento: "",
    fotos: "",
    valorModo: "",
    areaTipo: "",
    exata: "",
    contagem: "",
  });
  assert.equal(parsed.finalidade, undefined);
  assert.equal(parsed.contagem, "minima");
  assert.equal(parsed.areaTipo, "construida");
  assert.equal(plainText("104m&sup2; &eacute; área"), "104m² é área");
});
