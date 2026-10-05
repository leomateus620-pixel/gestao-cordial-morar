import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNfseXml,
  buildNfseConsultXml,
  civilDateBR,
  decimalBR,
  inferTomadorTipo,
  normalizeItemListaServico,
  sanitizeText,
  type NfsePayload,
} from "./xml.ts";
import { parseNfseResponse } from "./response.ts";

function basePayload(overrides: Partial<NfsePayload> = {}): NfsePayload {
  return {
    teste: true,
    dataFatoGerador: "2026-09-30",
    layout: "122/2025",
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
      finNFSe: "0",
      indFinal: "0",
      tpOper: "5",
      imovel: {
        end: { cep: "98900000", logradouro: "Rua do Imóvel", numero: "123", bairro: "Centro" },
      },
    },
    ...overrides,
  };
}

test("decimal brasileiro usa vírgula", () => {
  assert.equal(decimalBR(1234.5), "1234,50");
  assert.equal(decimalBR(3, 4), "3,0000");
  assert.throws(() => decimalBR(Number.NaN), /inválido/);
});

test("texto livre escapa entidades e remove barras", () => {
  assert.equal(
    sanitizeText("A/B & <c> \"d\" 'e'"),
    "A-B &amp; &lt;c&gt; &quot;d&quot; &apos;e&apos;",
  );
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
  assert.match(xml, /<codigo_item_lista_servico>1005<\/codigo_item_lista_servico>/);
  assert.match(xml, /<cLocalidadeIncid>4317202<\/cLocalidadeIncid>/);
  assert.match(xml, /<CST>011<\/CST>/);
  assert.match(xml, /<cClassTrib>011004<\/cClassTrib>/);
  assert.ok(!/Rua A\/B/.test(xml), "barra não pode aparecer em texto livre");
});

test("item da lista de serviço sai só com dígitos", () => {
  assert.equal(normalizeItemListaServico("10.05"), "1005");
  assert.equal(normalizeItemListaServico("1005"), "1005");
  assert.equal(normalizeItemListaServico("1.05"), "0105");
  assert.equal(normalizeItemListaServico("10.05.01"), "100501");
  assert.equal(normalizeItemListaServico("100501"), "100501");
  assert.throws(() => normalizeItemListaServico("10"), /inválido/);
  assert.throws(() => normalizeItemListaServico(""), /inválido/);
  assert.throws(() => normalizeItemListaServico("10.05.0"), /inválido/);
});

test("XML não leva ponto nos campos numéricos de código", () => {
  const xml = buildNfseXml(
    basePayload({
      item: {
        codigoLocalPrestacaoServico: "8847",
        codigoItemListaServico: "10.05",
        codigoNbs: "1.1001.21.00",
        aliquota: 3,
        situacaoTributaria: "0",
        tributaMunicipioPrestador: "S",
      },
    }),
  );
  assert.match(xml, /<codigo_item_lista_servico>1005<\/codigo_item_lista_servico>/);
  assert.match(xml, /<codigo_nbs>110012100<\/codigo_nbs>/);
  assert.match(xml, /<situacao_tributaria>0<\/situacao_tributaria>/);
  assert.match(xml, /<cep>98900000<\/cep>/);
  assert.match(xml, /<cIndOp>020101<\/cIndOp>/);
  const codeTags =
    xml.match(/<(codigo_item_lista_servico|codigo_nbs|cIndOp|CST|cClassTrib)>[^<]*<\/\1>/g) ?? [];
  for (const t of codeTags) assert.ok(!/\./.test(t), `ponto em campo numérico: ${t}`);
});

test("perfil sem IBS/CBS omite os grupos da reforma", () => {
  const xml = buildNfseXml(basePayload({ ibsCbs: null, teste: false }));
  assert.match(xml, /<nfse_teste>0<\/nfse_teste>/);
  assert.ok(!/IBSCBS/.test(xml));
});

test("fato gerador usa data civil explícita sem depender do timezone", () => {
  assert.equal(civilDateBR("2026-09-01"), "01/09/2026");
  assert.equal(civilDateBR("2028-02-29"), "29/02/2028");
  for (const invalid of ["2026-02-29", "2026-00-01", "2026-09-31", "2026-09-01T00:00:00Z", ""])
    assert.throws(() => civilDateBR(invalid));
  assert.match(buildNfseXml(basePayload()), /<data_fato_gerador>30\/09\/2026<\/data_fato_gerador>/);
});

test("prestador e tomador preservam CNPJ alfanumérico", () => {
  const p = basePayload();
  p.prestador.cpfCnpj = "12.ABC.345/01DE-35";
  p.tomador.cpfCnpj = "12.ABC.345/01DE-35";
  p.tomador.tipo = "J";
  assert.equal((buildNfseXml(p).match(/<cpfcnpj>12ABC34501DE35<\/cpfcnpj>/g) ?? []).length, 2);
  p.prestador.cpfCnpj += "EXTRA";
  assert.throws(() => buildNfseXml(p), /prestador/);
});

test("NBS e códigos IBS/CBS são explícitos; tpOper não recebe padrão", () => {
  const p = basePayload();
  delete p.item.codigoNbs;
  assert.throws(() => buildNfseXml(p), /NBS/);
  const missingOperation = basePayload();
  delete missingOperation.ibsCbs!.tpOper;
  assert.throws(() => buildNfseXml(missingOperation), /tpOper/);
  const missingPurpose = basePayload();
  delete missingPurpose.ibsCbs!.finNFSe;
  assert.throws(() => buildNfseXml(missingPurpose), /finNFSe/);
});

test("imóvel e referências só constam quando exigidos pela operação", () => {
  const p = basePayload();
  delete p.ibsCbs!.imovel;
  assert.throws(() => buildNfseXml(p), /CIB ou endereço/);
  const q = basePayload();
  q.ibsCbs!.tpOper = "2";
  assert.throws(() => buildNfseXml(q), /referenciada/);
  q.ibsCbs!.refNfse = ["1".repeat(50)];
  assert.match(buildNfseXml(q), /<gRefNFSe>/);
  q.ibsCbs!.tpOper = "5";
  assert.throws(() => buildNfseXml(q), /Referências/);
  const other = basePayload();
  other.item.codigoItemListaServico = "01.01";
  other.ibsCbs!.cIndOp = "100001";
  delete other.ibsCbs!.imovel;
  delete other.ibsCbs!.tpOper;
  const xml = buildNfseXml(other);
  assert.doesNotMatch(xml, /<tpOper>|<imovel>/);
});

test("consulta documentada não contém emissão e exige identificadores disponíveis", () => {
  assert.equal(
    buildNfseConsultXml({ codigoAutenticidade: "ABC&001" }),
    "<nfse><pesquisa><codigo_autenticidade>ABC&amp;001</codigo_autenticidade></pesquisa></nfse>",
  );
  assert.equal(
    buildNfseConsultXml({ numero: "00123", serie: "1", cadastro: "000123" }),
    "<nfse><pesquisa><numero>00123</numero><serie_nfse>1</serie_nfse><cadastro>000123</cadastro></pesquisa></nfse>",
  );
  assert.throws(() => buildNfseConsultXml({ codigoAutenticidade: "" }));
  assert.throws(() => buildNfseConsultXml({ numero: "123", serie: "", cadastro: "000123" }));
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

test("retorno JSON de erro expõe a mensagem real da prefeitura", () => {
  const parsed = parseNfseResponse('{"retorno":{"msg":"Acesso Negado!","sis":"EST","code":401}}');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.mensagem, "Acesso Negado!");
  assert.deepEqual(parsed.codigosErro, ["401"]);
});

test("retorno JSON de validação em modo teste é reconhecido", () => {
  const parsed = parseNfseResponse('{"retorno":{"msg":"NFS-e válida para emissão","code":100}}');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.testeValidado, true);
  assert.deepEqual(parsed.codigosErro, []);
});

test("JSON inválido ou sem retorno cai no parser XML", () => {
  const parsed = parseNfseResponse('{"outra":"coisa"}');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.mensagem, null);
});
