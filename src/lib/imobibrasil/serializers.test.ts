import test from "node:test";
import assert from "node:assert/strict";

import {
  areaToString,
  boolToImageSimNao,
  boolToSimNao,
  buildExternalReference,
  hashPayload,
  moneyToString,
  normalizeExibirEnderecoSite,
  normalizeLabel,
  serializeProperty,
  toFinalidade,
  type LocalPropertyForSync,
  type ResolvedProviderCodes,
} from "./serializers.ts";

const base: LocalPropertyForSync = {
  id: "1f9d2c34-5678-4abc-9def-0123456789ab",
  operacao: "venda",
  tipo: "Casa",
};

test("área decimal vira string com vírgula", () => {
  assert.equal(areaToString(140.8), "140,80");
  assert.equal(areaToString(200), "200");
  assert.equal(areaToString(0), undefined);
  assert.equal(areaToString(null), undefined);
});

test("dinheiro em reais inteiros e Consulte nunca vira zero", () => {
  assert.equal(moneyToString(450000), "450000");
  assert.equal(moneyToString(0), undefined);
  assert.equal(moneyToString(null), undefined);
  const payload = serializeProperty({ ...base, valor: 450000, valor_modo: "consulte" }, {}, { mode: "insert" });
  assert.equal(payload["valorImovel"], undefined);
});

test("booleanos usam sim/nao no JSON e sim/nao na imagem", () => {
  assert.equal(boolToSimNao(true), "sim");
  assert.equal(boolToSimNao(false), "nao");
  assert.equal(boolToSimNao(null), undefined);
  assert.equal(boolToImageSimNao(true), "sim");
  assert.equal(boolToImageSimNao(false), "nao");
});

test("Personalizado mantém o P maiúsculo", () => {
  assert.equal(normalizeExibirEnderecoSite("personalizado"), "Personalizado");
  assert.equal(normalizeExibirEnderecoSite("Completo"), "Completo");
  assert.equal(normalizeExibirEnderecoSite(""), undefined);
});

test("finalidade deriva de operacao quando ausente", () => {
  assert.equal(toFinalidade({ ...base, operacao: "aluguel" }), "locacao");
  assert.equal(toFinalidade({ ...base, finalidade: "temporada" }), "temporada");
  assert.equal(toFinalidade(base), "venda");
});

test("campos vazios são omitidos em vez de virar null", () => {
  const payload = serializeProperty({ ...base, bairro: "  ", cidade: null } as LocalPropertyForSync, {}, {
    mode: "insert",
  });
  assert.equal("bairro" in payload, false);
  assert.equal("codigoCidade" in payload, false);
  assert.equal("dormitorios" in payload, false);
});

test("descricaoTipoImovel só existe na criação", () => {
  const codes: ResolvedProviderCodes = { descricaoTipoImovel: "Casa", codigoTipoImovel: "12" };
  const insert = serializeProperty(base, codes, { mode: "insert" });
  const update = serializeProperty(base, codes, { mode: "update" });
  assert.equal(insert["descricaoTipoImovel"], "Casa");
  assert.equal("descricaoTipoImovel" in update, false);
  assert.equal(update["codigoTipoImovel"], "12");
});

test("tipoareaConstruida preserva o a minúsculo e só viaja com a área", () => {
  const withArea = serializeProperty({ ...base, area_construida: 98.5 }, { tipoAreaConstruida: "3" }, {
    mode: "insert",
  });
  assert.equal(withArea["areaConstruida"], "98,50");
  assert.equal(withArea["tipoareaConstruida"], "3");
  const withoutArea = serializeProperty(base, { tipoAreaConstruida: "3" }, { mode: "insert" });
  assert.equal("tipoareaConstruida" in withoutArea, false);
});

test("referência externa é estável a partir do UUID", () => {
  const first = buildExternalReference(base.id);
  const second = buildExternalReference(base.id);
  assert.equal(first, second);
  assert.equal(first, "GC-1F9D2C345678");
  const payload = serializeProperty(base, {}, { mode: "insert" });
  assert.equal(payload["referencia"], first);
});

test("códigos de catálogo nunca são inventados", () => {
  const payload = serializeProperty({ ...base, cidade: "Passo Fundo" } as LocalPropertyForSync, {}, {
    mode: "insert",
  });
  assert.equal("codigoCidade" in payload, false);
  assert.equal("codigoTipoImovel" in payload, false);
});

test("mapeamentos de Cordial e Morar produzem códigos distintos", () => {
  const cordial = serializeProperty(base, { codigoTipoImovel: "7", codigoCidade: "101" }, { mode: "update" });
  const morar = serializeProperty(base, { codigoTipoImovel: "23", codigoCidade: "884" }, { mode: "update" });
  assert.equal(cordial["codigoTipoImovel"], "7");
  assert.equal(morar["codigoTipoImovel"], "23");
  assert.notEqual(cordial["codigoCidade"], morar["codigoCidade"]);
  assert.notEqual(hashPayload(cordial), hashPayload(morar));
});

test("hash é determinístico e ignora ordem das chaves", () => {
  const a = serializeProperty({ ...base, bairro: "Centro", valor: 100 }, {}, { mode: "insert" });
  const b = serializeProperty({ ...base, valor: 100, bairro: "Centro" }, {}, { mode: "insert" });
  assert.equal(hashPayload(a), hashPayload(b));
  const c = serializeProperty({ ...base, bairro: "Boqueirão", valor: 100 }, {}, { mode: "insert" });
  assert.notEqual(hashPayload(a), hashPayload(c));
});

test("empreendimento só aparece quando habilitado", () => {
  const off = serializeProperty({ ...base, nome_empreendimento: "Residencial X" }, {}, { mode: "insert" });
  assert.equal("nomeEmpreendimento" in off, false);
  const on = serializeProperty(
    { ...base, tratar_empreendimento: true, nome_empreendimento: "Residencial X" },
    {},
    { mode: "insert" },
  );
  assert.equal(on["nomeEmpreendimento"], "Residencial X");
  assert.equal(on["tratarEmpreendimento"], "sim");
});

test("normalizeLabel remove acentos e pontuação", () => {
  assert.equal(normalizeLabel("Sala Comercial / Loja"), "sala comercial loja");
  assert.equal(normalizeLabel("Chácara"), "chacara");
});

test("sanitizeRichText remove emojis, mantém acentos e quebra linhas", () => {
  const input = "✨ Casa à venda!\n🔹 01 quarto\n✔️ Localização — próximo a tudo";
  const out = sanitizeRichText(input);
  assert.equal(out, "Casa à venda!<br />- 01 quarto<br />- Localização - próximo a tudo");
  assert.equal(/[?]/.test(out ?? ""), false);
});

test("sanitizeRichText devolve undefined para vazio", () => {
  assert.equal(sanitizeRichText("   "), undefined);
  assert.equal(sanitizeRichText(null), undefined);
});
