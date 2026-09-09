import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNfseXml,
  decimalBR,
  inferTomadorTipo,
  parseNfseResponse,
  sanitizeText,
  type NfsePayload,
} from "./xml.ts";

function basePayload(overrides: Partial<NfsePayload> = {}): NfsePayload {
  return {
    teste: true,
    valor: 1234.5,
    descritivo: "Administração de imóvel — Rua A/B <teste> & cia",
    observacao: "Competência 09/2026",
    prestador: { cpfCnpj: "12.345.678/0001-90", cidadeTom: "8847" },
    tomador: {
      tipo: "F",
      cpfCnpj: "123.456.789-09",
      nomeRazaoSocial: "Maria da Silva",
      logradouro: "Rua das Flores",
      numeroResidencia: "123",
      bairro: "Centro",
      cidadeTom: "8847",
      cep: "98900-000",
      dddFone: "55",
      fone: "999998888",
      email: "maria@exemplo.com",
    },
    item: {
      codigoLocalPrestacaoServico: "8847",
      codigoItemListaServico: "10.05",
      codigoNbs: "123456789",
      aliquota: 3,
      situacaoTributaria: "0",
      tributaMunicipioPrestador: "S",
    },
    ibsCbs: {
      cLocalidadeIncid: "4317202",
      cIndOp: "020101",
      cst: "011",
      cClassTrib: "011004",
    },
    ...overrides,
  };
}

test("decimal brasileiro usa vírgula", () => {
  assert.equal(decimalBR(1234.5), "1234,50");
  assert.equal(decimalBR(3, 4), "3,0000");
  assert.equal(decimalBR(Number.NaN), "0,00");
});

test("texto livre escapa entidades e remove barras", () => {
  assert.equal(sanitizeText("A/B & <c> \"d\" 'e'"), "A-B &amp; &lt;c&gt; &quot;d&quot; &apos;e&apos;");
});

test("tipo do tomador é inferido pelo documento", () => {
  assert.equal(inferTomadorTipo("123.456.789-09"), "F");
  assert.equal(inferTomadorTipo("12.345.678/0001-90"), "J");
});

test("XML de teste traz valores BR, documentos limpos e IBSCBS", () => {
  const xml = buildNfseXml(basePayload());
  assert.match(xml, /<nfse_teste>1<\/nfse_teste>/);
  assert.match(xml, /<valor_total>1234,50<\/valor_total>/);
  assert.match(xml, /<cpfcnpj>12345678000190<\/cpfcnpj>/);
  assert.match(xml, /<cidade>8847<\/cidade>/);
  assert.match(xml, /<aliquota_item_lista_servico>3,0000<\/aliquota_item_lista_servico>/);
  assert.match(xml, /<codigo_item_lista_servico>10\.05<\/codigo_item_lista_servico>/);
  assert.match(xml, /<cLocalidadeIncid>4317202<\/cLocalidadeIncid>/);
  assert.match(xml, /<CST>011<\/CST>/);
  assert.match(xml, /<cClassTrib>011004<\/cClassTrib>/);
  assert.ok(!/Rua A\/B/.test(xml), "barra não pode aparecer em texto livre");
});

test("Simples Nacional (sem IBS/CBS) omite os grupos da reforma", () => {
  const xml = buildNfseXml(basePayload({ ibsCbs: null, teste: false }));
  assert.match(xml, /<nfse_teste>0<\/nfse_teste>/);
  assert.ok(!/IBSCBS/.test(xml));
});

test("retorno de teste é reconhecido como válido", () => {
  const parsed = parseNfseResponse(
    "<retorno><mensagem><codigo>NFS-e válida para emissão.</codigo></mensagem></retorno>",
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.testeValidado, true);
  assert.deepEqual(parsed.codigosErro, []);
});

test("retorno com crítica numérica vira erro legível", () => {
  const parsed = parseNfseResponse(
    "<retorno><mensagem><codigo>00336</codigo><descricao>Informe as alíquotas do IBS/CBS</descricao></mensagem></retorno>",
  );
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.codigosErro, ["00336"]);
});

test("retorno de emissão captura número, verificador e link", () => {
  const parsed = parseNfseResponse(
    "<retorno><numero_nfse>123</numero_nfse><codigo_verificacao>ABC123</codigo_verificacao><link_nfse>https://santarosa.atende.net/nfse/123</link_nfse></retorno>",
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.numeroNfse, "123");
  assert.equal(parsed.codigoVerificador, "ABC123");
  assert.equal(parsed.linkPdf, "https://santarosa.atende.net/nfse/123");
});
