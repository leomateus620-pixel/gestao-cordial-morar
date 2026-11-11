import test from "node:test";
import assert from "node:assert/strict";
import {
  propertySlug,
  parsePropertyParam,
  autoPropertySeo,
} from "../../src/lib/cordial-site/property-slug";
import { activeBanners, bannerStatus } from "../../src/lib/cordial-site/banners";
import { selectFeatured } from "../../src/lib/cordial-site/home-selection";
import {
  normalizeOldPath,
  parseRedirectCsv,
  previewRedirects,
  applicable,
} from "../../src/lib/cordial-site/redirect-import";
import { defaultOrder, allowedTypes } from "../../src/lib/cordial-site/search-settings";
import { settingsSchema, type SiteBanner } from "../../src/lib/cordial-site/contract";
import { breadcrumbJsonLd } from "../../src/lib/cordial-site/seo";

const ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const prop = {
  id: ID,
  reference: "1398",
  operation: "venda",
  type: "Casa",
  district: "Centro",
  city: "Santa Rosa",
  bedrooms: 3,
};

test("endereço amigável traz tipo, finalidade, quartos, bairro, cidade, referência e termina no id", () => {
  assert.equal(propertySlug(prop), `casa-a-venda-3-quartos-centro-santa-rosa-ref-1398-${ID}`);
  assert.equal(parsePropertyParam(propertySlug(prop)), ID);
  assert.equal(parsePropertyParam(ID), ID);
  assert.equal(parsePropertyParam("casa-centro"), null);
  assert.equal(
    propertySlug({ id: ID, type: "Apartamento São João", operation: "aluguel", bedrooms: 1 }),
    `apartamento-sao-joao-para-alugar-1-quarto-${ID}`,
  );
});

test("SEO automático usa só dados existentes e respeita limites", () => {
  const s = autoPropertySeo({ ...prop, price: 450000, priceMode: "fixo" });
  assert.equal(s.title, "Casa com 3 quartos à venda em Centro, Santa Rosa");
  assert.match(s.description, /R\$\s?450\.000/);
  assert.match(s.description, /Ref\. 1398/);
  assert.ok(s.description.length <= 200);
  assert.doesNotMatch(autoPropertySeo({ id: ID, priceMode: "consulte" }).description, /R\$/);
});

const banner = (p: Partial<SiteBanner>): SiteBanner => ({
  id: crypto.randomUUID(),
  imageUrl: "https://x.com/a.jpg",
  mobileImageUrl: "",
  title: "",
  caption: "",
  href: "",
  alt: "Campanha",
  startsAt: null,
  endsAt: null,
  active: true,
  ...p,
});

test("banner aparece só dentro do período e quando ativo", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const list = [
    banner({ title: "a" }),
    banner({ title: "futuro", startsAt: "2026-11-12T00:00:00Z" }),
    banner({ title: "fim", endsAt: "2026-11-11T12:00:00Z" }),
    banner({ title: "pausado", active: false }),
  ];
  assert.deepEqual(
    activeBanners(list, now).map((b) => b.title),
    ["a"],
  );
  assert.equal(bannerStatus(list[1], now), "agendado");
  assert.equal(bannerStatus(list[2], now), "encerrado");
  assert.equal(bannerStatus(list[3], now), "pausado");
});

test("configuração rejeita banner com fim antes do início e mistura acima de cinco", () => {
  assert.throws(() =>
    settingsSchema.parse({
      banners: [banner({ startsAt: "2026-11-12T00:00:00Z", endsAt: "2026-11-11T00:00:00Z" })],
    }),
  );
  assert.throws(() => settingsSchema.parse({ featuredMix: { venda: 3, aluguel: 3 } }));
  assert.deepEqual(settingsSchema.parse({}).featuredMix, { venda: 0, aluguel: 0 });
});

const mk = (id: number, operation: "venda" | "aluguel") =>
  ({ id: String(id), operation, cover: { id: "x" } }) as never;

test("destaques reservam vagas por finalidade e completam com os recentes", () => {
  const recent = [
    mk(1, "venda"),
    mk(2, "venda"),
    mk(3, "venda"),
    mk(4, "venda"),
    mk(5, "venda"),
    mk(6, "aluguel"),
    mk(7, "aluguel"),
  ];
  const out = selectFeatured({
    mode: "recentes",
    editorialIds: [],
    editorial: [],
    recent,
    mix: { venda: 0, aluguel: 2 },
  });
  assert.equal(out.length, 5);
  assert.equal(out.filter((p: { operation: string }) => p.operation === "aluguel").length, 2);
  const plain = selectFeatured({ mode: "recentes", editorialIds: [], editorial: [], recent });
  assert.deepEqual(
    plain.map((p: { id: string }) => p.id),
    ["1", "2", "3", "4", "5"],
  );
});

test("planilha de redirecionamentos: normaliza, valida marca e não confirma inválidos", () => {
  assert.equal(normalizeOldPath("https://antigo.com.br/imovel/2093999"), "/imovel/2093999/");
  assert.equal(normalizeOldPath("/imovel/abc"), null);
  const rows = parseRedirectCsv(
    "endereco;referencia\n/imovel/1/;1398\n/imovel/2;9999\n/imovel/3;3419\n/imovel/1;1398\nlixo;1",
  );
  const prev = previewRedirects(rows, new Map([["1398", ID]]), new Set(["3419"]), new Set());
  assert.deepEqual(
    prev.map((r) => r.status),
    ["valido", "nao_encontrado", "outra_marca", "repetido", "endereco_invalido"],
  );
  assert.equal(applicable(prev).length, 1);
});

test("busca: ordenação padrão vale só na busca inicial e tipos filtram por finalidade", () => {
  assert.equal(defaultOrder("recentes", true, { searchDefaultOrder: "preco_asc" }), "preco_asc");
  assert.equal(defaultOrder("recentes", false, { searchDefaultOrder: "preco_asc" }), "recentes");
  assert.equal(defaultOrder("preco_desc", true, { searchDefaultOrder: "preco_asc" }), "preco_desc");
  const types = [{ value: "Casa" }, { value: "Sala" }];
  assert.deepEqual(
    allowedTypes(types, "aluguel", { searchTypes: { venda: [], aluguel: ["sala"] } }),
    [{ value: "Sala" }],
  );
  assert.equal(
    allowedTypes(types, "venda", { searchTypes: { venda: [], aluguel: ["sala"] } }).length,
    2,
  );
});

test("trilha de navegação termina no endereço oficial do imóvel", () => {
  const ld = breadcrumbJsonLd(
    { ...prop, operation: "venda" } as never,
    "https://cordialimoveis.com",
    "cordial",
  );
  const items = ld.itemListElement;
  assert.equal(items[0].name, "Início");
  assert.equal(items[1].name, "Comprar");
  assert.ok(String(items.at(-1)!.item).endsWith(`/imovel/${propertySlug(prop)}`));
});
