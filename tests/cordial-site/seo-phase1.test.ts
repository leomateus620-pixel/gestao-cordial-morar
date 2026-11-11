import test from "node:test";
import assert from "node:assert/strict";
import { siteHead, siteLayoutHead, homeHead, seoText, agentJsonLd } from "../../src/lib/cordial-site/seo";
import { legacyImobiId } from "../../src/lib/cordial-site/request.server";
import { settingsSchema, verificationCode } from "../../src/lib/cordial-site/contract";
import { privacyIssues, privacyTemplate } from "../../src/lib/cordial-site/privacy-template";
import { pixelEventFor, isGtmId, isPixelId } from "../../src/lib/cordial-site/meta-pixel";

const boot = (brand: "cordial" | "morar", extra = {}) =>
  ({
    settings: settingsSchema.parse(extra),
    facets: {} as never,
    available: true,
    canonicalOrigin: brand === "morar" ? "https://imobiliariamorarimoveis.com.br" : "https://cordialimoveis.com",
    indexable: true,
  });

test("layout emite ícones e nunca canônica/og:url; página emite exatamente uma canônica", () => {
  for (const brand of ["cordial", "morar"] as const) {
    const layout = siteLayoutHead(boot(brand), brand);
    assert.equal(layout.links.filter((l) => l.rel === "canonical").length, 0);
    assert.ok(layout.links.some((l) => l.rel === "icon" && l.href.startsWith(`/${brand}-site/`)));
    const base = brand === "morar" ? "/site-morar" : "/site";
    const host = boot(brand).canonicalOrigin;
    for (const path of ["/", "/contato", "/buscar", "/bairros", "/imovel/0b0e1c3a-1111-4111-8111-111111111111"]) {
      const page = siteHead("T", "D", boot(brand), `${base}${path}`, false, undefined, brand);
      const all = [...layout.links, ...page.links].filter((l) => l.rel === "canonical");
      assert.equal(all.length, 1);
      assert.equal(all[0].href, `${host}${path}`);
    }
  }
});

test("imagem social, twitter e domínio são da própria marca", () => {
  const h = siteHead("T", "D ==> x", boot("morar"), "/site-morar/", false, undefined, "morar");
  const get = (k: string) => h.meta.find((m) => ("property" in m && m.property === k) || ("name" in m && m.name === k)) as { content: string };
  assert.equal(get("og:image").content, "https://imobiliariamorarimoveis.com.br/morar-site/og-default.jpg");
  assert.equal(get("twitter:image").content, get("og:image").content);
  assert.equal(get("twitter:card").content, "summary_large_image");
  assert.ok(!get("twitter:description").content.includes(">"));
});

test("título da home configurado é usado inteiro", () => {
  const h = homeHead(boot("morar", { homeTitle: "Morar Imóveis | Imobiliária em Santa Rosa/RS" }), "morar");
  assert.equal((h.meta[0] as { title: string }).title, "Morar Imóveis | Imobiliária em Santa Rosa/RS");
  const d = homeHead(boot("cordial"), "cordial");
  assert.equal((d.meta[0] as { title: string }).title, "Sentir-se em casa! | Cordial Imóveis");
});

test("descrição limpa corta em palavra inteira até 160", () => {
  const t = seoText("<p>Casa ==> ótima • " + "palavra ".repeat(40) + "</p>");
  assert.ok(t.length <= 160);
  assert.ok(!/==>|•/.test(t));
  assert.ok(t.endsWith("…"));
});

test("normalização dos endereços antigos do Imobi", () => {
  assert.equal(legacyImobiId("/imovel/2093999"), "2093999");
  assert.equal(legacyImobiId("/imovel/2093999/"), "2093999");
  assert.equal(legacyImobiId("/imovel/2093999/casa-centro"), "2093999");
  assert.equal(legacyImobiId("/imovel/abc"), null);
  assert.equal(legacyImobiId("/imovel/0b0e1c3a-1111-4111-8111-111111111111"), null);
});

test("validação dos campos de verificação e medição", () => {
  assert.ok(settingsSchema.safeParse({ metaPixelId: "714616464412645" }).success);
  assert.ok(!settingsSchema.safeParse({ metaPixelId: "abc" }).success);
  assert.ok(!settingsSchema.safeParse({ gtmContainerId: "GTM-1" }).success);
  assert.ok(!settingsSchema.safeParse({ bingSiteVerification: "xyz" }).success);
  assert.ok(!settingsSchema.safeParse({ homeTitle: "x".repeat(61) }).success);
  assert.equal(verificationCode('<meta name="google-site-verification" content="abcDEF_123-abcDEF_123" />'), "abcDEF_123-abcDEF_123");
  assert.ok(isPixelId("714616464412645") && isGtmId("GTM-ABC123"));
});

test("modelo de política exige substituir marcadores", () => {
  const draft = privacyTemplate("morar", { brand: "Morar Imóveis", email: "", address: "" });
  assert.ok(privacyIssues(draft).length > 0);
  assert.equal(privacyIssues(draft.replace(/\[[^\]]*\]/g, "ok")).length, 0);
});

test("Pixel recebe só referência, nunca dados de contato", () => {
  assert.deepEqual(pixelEventFor({ name: "form_persisted", phone: "5555" }), ["Lead", {}]);
  assert.deepEqual(pixelEventFor({ name: "property_open", reference: "1398", email: "a@b" }), ["ViewContent", { content_ids: "1398" }]);
});

test("dados da empresa usam só as redes da própria marca", () => {
  const ld = agentJsonLd(boot("cordial", { instagram: "https://instagram.com/cordial" }), "cordial")!;
  assert.deepEqual(ld.sameAs, ["https://instagram.com/cordial"]);
  assert.equal(ld.url, "https://cordialimoveis.com/");
});
