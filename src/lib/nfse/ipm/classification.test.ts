import assert from "node:assert/strict";
import test from "node:test";

import {
  checkMarkNotIssued,
  classifyResult,
  reclassifyFromRaw,
  shouldSuggestManualResolution,
} from "../emission-rules.ts";
import { decodeResponse, parseNfseResponse } from "./response.ts";

function latin1(text: string): Uint8Array {
  return Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 0xff));
}

const XSD = `<?xml version="1.0" encoding="ISO-8859-1"?>
<retorno><mensagem><codigo> XSD Error 1824: Element 'codigo_item_lista_servico': '10.05' is not a valid value of the atomic type 'xs:integer'. Serviço inválido</codigo></mensagem></retorno>`;

const NOTA = `<retorno><numero_nfse>900</numero_nfse><serie_nfse>1</serie_nfse><situacao_codigo_nfse>1</situacao_codigo_nfse><link_nfse>https://santarosa.atende.net/n</link_nfse><cod_verificador_autenticidade>ABC</cod_verificador_autenticidade></retorno>`;

test("XSD Error 1824 sem número → erro (real e teste), mensagem e acentos preservados", () => {
  const text = decodeResponse(latin1(XSD));
  const p = parseNfseResponse(text);
  assert.equal(p.kind, "recusa");
  assert.deepEqual(p.codigosErro, ["XSD-1824"]);
  assert.match(p.mensagem ?? "", /XSD Error 1824.*Serviço inválido/);
  assert.equal(classifyResult(p, 200, false), "erro");
  assert.equal(classifyResult(p, 200, true), "erro");
});

test("00383 - texto → erro com código 00383", () => {
  const p = parseNfseResponse("<retorno><mensagem><codigo>00383 - Lista de Serviço sem desdobramento</codigo></mensagem></retorno>");
  assert.deepEqual(p.codigosErro, ["00383"]);
  assert.equal(classifyResult(p, 200, false), "erro");
});

test("mensagens numéricas e textuais misturadas → erro com todas listadas", () => {
  const p = parseNfseResponse(
    "<retorno><mensagem><codigo>00383 - Sem desdobramento</codigo></mensagem><mensagem><codigo>Acesso negado</codigo></mensagem><mensagem><descricao>Tomador inválido</descricao></mensagem></retorno>",
  );
  assert.deepEqual(p.codigosErro, ["00383", "TEXTO", "TEXTO"]);
  assert.equal(p.mensagens.length, 3);
  assert.match(p.mensagem ?? "", /Sem desdobramento.*Acesso negado.*Tomador inválido/);
  assert.equal(classifyResult(p, 200, false), "erro");
});

test("número + mensagem → emitida em real, nunca erro (identificador repetido)", () => {
  const p = parseNfseResponse(NOTA.replace("<retorno>", "<retorno><mensagem><codigo>00999 - Identificador já processado</codigo></mensagem>"));
  assert.equal(p.kind, "sucesso");
  assert.equal(p.numeroNfse, "900");
  assert.equal(classifyResult(p, 200, false), "emitida");
});

test("número com situação 2 → incerto", () => {
  const p = parseNfseResponse(NOTA.replace("<situacao_codigo_nfse>1", "<situacao_codigo_nfse>2"));
  assert.equal(classifyResult(p, 200, false), "incerto");
});

test("vazio, HTML, XML sem retorno, retorno vazio e 5xx → incerto", () => {
  for (const raw of ["", "<html><body>x</body></html>", "texto solto", "<outro><a>1</a></outro>", "<retorno></retorno>", "<retorno/>"]) {
    assert.equal(classifyResult(parseNfseResponse(raw), 200, false), "incerto", raw);
  }
  assert.equal(classifyResult(parseNfseResponse(XSD), 503, false), "incerto");
});

test("regra de marcar como não emitida", () => {
  const ok = { isAdmin: true, status: "incerto", numeroNfse: null, reason: "Conferido no portal em 02/10", conferidoNoPortal: true };
  assert.equal(checkMarkNotIssued(ok), null);
  assert.ok(checkMarkNotIssued({ ...ok, isAdmin: false }));
  assert.ok(checkMarkNotIssued({ ...ok, reason: "curto" }));
  assert.ok(checkMarkNotIssued({ ...ok, conferidoNoPortal: false }));
  assert.ok(checkMarkNotIssued({ ...ok, status: "erro" }));
  assert.ok(checkMarkNotIssued({ ...ok, status: "emitida" }));
  assert.ok(checkMarkNotIssued({ ...ok, numeroNfse: "900" }));
});

test("conferência: recusa → erro, número → emitida", () => {
  assert.equal(classifyResult(parseNfseResponse(XSD), 200, false), "erro");
  assert.equal(classifyResult(parseNfseResponse(NOTA), 200, false), "emitida");
});

test("sugestão manual depois de 3 conferências seguidas em incerto", () => {
  assert.equal(shouldSuggestManualResolution("incerto", 3), false);
  assert.equal(shouldSuggestManualResolution("incerto", 4), true);
  assert.equal(shouldSuggestManualResolution("erro", 9), false);
});

test("reclassificação: incerto com recusa gravada → erro; sem retorno → inalterado", () => {
  assert.equal(reclassifyFromRaw("incerto", XSD, false, parseNfseResponse), "erro");
  assert.equal(reclassifyFromRaw("incerto", NOTA, false, parseNfseResponse), "emitida");
  assert.equal(reclassifyFromRaw("incerto", null, false, parseNfseResponse), null);
  assert.equal(reclassifyFromRaw("incerto", "<html></html>", false, parseNfseResponse), null);
  assert.equal(reclassifyFromRaw("erro", XSD, false, parseNfseResponse), null);
});
