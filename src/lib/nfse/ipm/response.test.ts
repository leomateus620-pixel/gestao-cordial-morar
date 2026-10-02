import assert from "node:assert/strict";
import test from "node:test";

import { classifyResult } from "../emission-rules.ts";
import { decodeResponse, parseNfseResponse } from "./response.ts";

function latin1(text: string): Uint8Array {
  return Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 0xff));
}

const TESTE_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<retorno>
	<mensagem>
		<codigo>NFS-e válida para emissão.</codigo>
	</mensagem>
	<numero_nfse>729</numero_nfse>
	<serie_nfse>1</serie_nfse>
	<data_nfse>01/10/2026</data_nfse>
	<hora_nfse>12:57:52</hora_nfse>
	<situacao_codigo_nfse>1</situacao_codigo_nfse>
	<situacao_descricao_nfse>Emitida</situacao_descricao_nfse>
	<link_nfse>https://santarosa.atende.net/x</link_nfse>
	<cod_verificador_autenticidade>8847011</cod_verificador_autenticidade>
</retorno>`;

test("decodifica ISO-8859-1 pelo prólogo e pelo Content-Type", () => {
  const bytes = latin1(TESTE_XML.replace("válida", "válida").replace("</retorno>", "<x>Serviço</x></retorno>"));
  const text = decodeResponse(bytes);
  assert.ok(text.includes("válida para emissão"));
  assert.ok(text.includes("Serviço"));
  assert.ok(decodeResponse(bytes, "text/xml; charset=ISO-8859-1").includes("Serviço"));
  const utf8 = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><retorno>Serviço</retorno>');
  assert.ok(decodeResponse(utf8).includes("Serviço"));
});

test("várias mensagens NNNNN - texto no mesmo retorno", () => {
  const p = parseNfseResponse(
    "<retorno><mensagem><codigo>00383 - Lista de Serviço sem desdobramento</codigo></mensagem><mensagem><codigo>00336 - Informe as alíquotas</codigo></mensagem></retorno>",
  );
  assert.equal(p.kind, "recusa");
  assert.deepEqual(p.codigosErro, ["00383", "00336"]);
  assert.match(p.mensagem ?? "", /00383 - Lista de Serviço.*00336 - Informe/);
  assert.equal(classifyResult(p, 200, true), "erro");
});

test("retorno de teste com número vira teste_ok", () => {
  const p = parseNfseResponse(TESTE_XML);
  assert.equal(p.kind, "teste_ok");
  assert.equal(classifyResult(p, 200, true), "teste_ok");
  // Em modo real, um retorno de "válida" (teste) não é aceito como emitida.
  assert.equal(classifyResult(p, 200, false), "incerto");
});

test("retorno de sucesso real vira emitida com número, série, link e verificador", () => {
  const p = parseNfseResponse(TESTE_XML.replace(/<mensagem>[\s\S]*?<\/mensagem>/, ""));
  assert.equal(p.kind, "sucesso");
  assert.equal(p.numeroNfse, "729");
  assert.equal(p.serieNfse, "1");
  assert.equal(p.linkPdf, "https://santarosa.atende.net/x");
  assert.equal(p.codigoVerificador, "8847011");
  assert.equal(classifyResult(p, 200, false), "emitida");
  const cancelada = parseNfseResponse(TESTE_XML.replace(/<mensagem>[\s\S]*?<\/mensagem>/, "").replace("<situacao_codigo_nfse>1", "<situacao_codigo_nfse>2"));
  assert.equal(classifyResult(cancelada, 200, false), "incerto");
});

test("JSON 401 vira recusa com código", () => {
  const p = parseNfseResponse('{"retorno":{"msg":"Acesso Negado!","sis":"EST","code":401}}');
  assert.equal(p.kind, "recusa");
  assert.deepEqual(p.codigosErro, ["401"]);
  assert.equal(classifyResult(p, 401, true), "erro");
});

test("retorno vazio, HTML ou 5xx vira incerto", () => {
  assert.equal(classifyResult(parseNfseResponse(""), 200, false), "incerto");
  assert.equal(classifyResult(parseNfseResponse("<html><body>erro</body></html>"), 200, false), "incerto");
  assert.equal(classifyResult(parseNfseResponse("<!DOCTYPE html><html></html>"), 200, true), "incerto");
  assert.equal(classifyResult(parseNfseResponse(TESTE_XML), 502, true), "incerto");
  assert.equal(classifyResult(parseNfseResponse("<retorno><foo>1</foo></retorno>"), 200, false), "incerto");
});
