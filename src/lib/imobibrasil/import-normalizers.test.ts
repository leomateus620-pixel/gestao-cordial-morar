import assert from "node:assert/strict";
import test from "node:test";
import {
  flattenAddress,
  normalizeRemoteImages,
  normalizeRemoteProperty,
  parseDecimal,
  parseInteger,
} from "./import-normalizers.ts";
import { matchProperty, type LocalCandidate } from "./dedupe.ts";
import { extractPage, extractRecord } from "./read-parsers.ts";

test("parseDecimal aceita vírgula decimal e separador de milhar", () => {
  assert.equal(parseDecimal("1.234,56"), 1234.56);
  assert.equal(parseDecimal("450000,00"), 450000);
  assert.equal(parseDecimal("1,234.56"), 1234.56);
  assert.equal(parseDecimal("R$ 320.000"), 320000);
});

test("parseDecimal não inventa zero para vazio ou inválido", () => {
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal(null), null);
  assert.equal(parseDecimal("-"), null);
  assert.equal(parseInteger(undefined), null);
});

test("normalizeRemoteProperty achata endereço em array e mapeia campos essenciais", () => {
  const normalized = normalizeRemoteProperty("cordial", "3584808", {
    codigoImovel: "3584808",
    referenciaImovel: "925",
    finalidade: "Locação",
    tipoImovel: "Sala Comercial",
    endereco: [{ bairro: "Bairro Centro", cidade: "Santa Rosa", uf: "RS", cep: "98900-000" }],
    valorImovel: "1.500,00",
    areaPrivativa: "45,5",
    dormitorios: "",
    garagem: "1",
  });
  assert.equal(normalized.operacao, "aluguel");
  assert.equal(normalized.finalidade, "locacao");
  assert.equal(normalized.cidade, "Santa Rosa");
  assert.equal(normalized.valor, 1500);
  assert.equal(normalized.areaPrincipal, 45.5);
  assert.equal(normalized.areaTipo, "privativa");
  assert.equal(normalized.dormitorios, null);
  assert.equal(normalized.vagas, 1);
});

test("flattenAddress não perde campos da raiz", () => {
  const flat = flattenAddress({ endereco: { bairro: "Centro" }, cidade: "Santa Rosa" });
  assert.equal(flat["bairro"], "Centro");
  assert.equal(flat["cidade"], "Santa Rosa");
});

test("normalizeRemoteImages ordena por destaque e ignora URLs inválidas", () => {
  const images = normalizeRemoteImages([
    { url: "https://x/1.jpg", ordem: 2 },
    { url: "not-a-url" },
    { url: "https://x/2.jpg", ordem: 1, destaque: "sim" },
  ]);
  assert.equal(images.length, 2);
  assert.equal(images[0]?.url, "https://x/2.jpg");
  assert.equal(images[0]?.isCover, true);
});

test("normalizeRemoteImages promove a primeira imagem a capa", () => {
  const images = normalizeRemoteImages([{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }]);
  assert.equal(images[0]?.isCover, true);
  assert.equal(images[1]?.isCover, false);
});

test("extractPage respeita resultSet e total_pages", () => {
  const page = extractPage(
    { status: true, resultSet: { page: 2, per_page: 50, total_pages: 7, total_items: 320, data: [{ codigoImovel: 1 }] } },
    2,
    50,
  );
  assert.equal(page.totalPages, 7);
  assert.equal(page.totalItems, 320);
  assert.equal(page.items.length, 1);
});

test("extractRecord desembrulha resultSet singular", () => {
  assert.equal(extractRecord({ status: true, resultSet: { codigoImovel: "10" } })["codigoImovel"], "10");
  assert.equal(extractRecord({ codigoImovel: "11" })["codigoImovel"], "11");
});

const base: LocalCandidate = {
  id: "local-1",
  carteira: "cordial",
  source: "cordial_website",
  source_property_id: "3584808",
  codigo: "925",
  referencia: null,
  operacao: "aluguel",
  tipo: "Sala Comercial",
  cidade: "Santa Rosa",
  bairro: "Bairro Centro",
  logradouro: null,
  numero: null,
  valor: 1500,
  area_principal: 45.5,
};

const remote = normalizeRemoteProperty("cordial", "3584808", {
  referenciaImovel: "925",
  finalidade: "Locação",
  tipoImovel: "Sala Comercial",
  cidade: "Santa Rosa",
  bairro: "Bairro Centro",
  valorImovel: "1500",
  areaPrivativa: "45,5",
});

test("dedupe liga registros existentes pelo código externo", () => {
  const result = matchProperty("cordial", remote, [base]);
  assert.equal(result.status, "exact_match");
  assert.equal(result.propertyId, "local-1");
});

test("dedupe usa a referência quando o código externo ainda não foi gravado", () => {
  const result = matchProperty("cordial", remote, [{ ...base, source_property_id: null }]);
  assert.equal(result.status, "exact_match");
  assert.ok(result.confidence > 0.9);
});

test("dedupe marca ambíguo com mais de um candidato equivalente", () => {
  const result = matchProperty("cordial", remote, [
    { ...base, id: "a", source_property_id: null },
    { ...base, id: "b", source_property_id: null },
  ]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.propertyId, null);
  assert.equal(result.alternatives.length, 2);
});

test("dedupe nunca mescla Morar com cadastro Cordial", () => {
  const morar = normalizeRemoteProperty("morar", "999", { referenciaImovel: "925" });
  assert.equal(matchProperty("morar", morar, [base]).status, "new");
});

test("dedupe cria novo quando não há correspondência segura", () => {
  const other = normalizeRemoteProperty("cordial", "111", { referenciaImovel: "777", cidade: "Ijuí" });
  assert.equal(matchProperty("cordial", other, [base]).status, "new");
});
