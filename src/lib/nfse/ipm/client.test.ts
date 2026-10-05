import assert from "node:assert/strict";
import test from "node:test";

import { buildBasicAuthHeader, NFSE_MAX_RESPONSE_BYTES, postNfse } from "./client.server.ts";
import { IPM_SANTA_ROSA_ENDPOINT } from "../validation.ts";

test("header Basic usa CNPJ só dígitos e base64 de login:senha", () => {
  const header = buildBasicAuthHeader("42.767.687/0001-35", "senha123");
  assert.equal(
    header,
    `Basic ${Buffer.from("42767687000135:senha123", "utf-8").toString("base64")}`,
  );
});

test("header Basic preserva login sem pontuação e senha com caracteres especiais", () => {
  const header = buildBasicAuthHeader("35080386000173", "a:b/c d");
  const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf-8");
  assert.equal(decoded, "35080386000173:a:b/c d");
});

test("header Basic preserva letras e zeros do CNPJ alfanumérico", () => {
  const header = buildBasicAuthHeader("12.ABC.345/01DE-35", "teste-local");
  assert.equal(
    Buffer.from(header.slice(6), "base64").toString("utf-8"),
    "12ABC34501DE35:teste-local",
  );
  assert.throws(() => buildBasicAuthHeader("12ABC34501DE35:evil", "x"));
});

const request = {
  endpointUrl: IPM_SANTA_ROSA_ENDPOINT,
  login: "12.ABC.345/01DE-35",
  senha: "fixture-local",
  cidade: "8847",
  xml: "<nfse><nfse_teste>1</nfse_teste></nfse>",
};

test("multipart envia cidade e arquivo f1, não segue redirecionamentos", async (t) => {
  let called = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    called = true;
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, "omit");
    const form = init.body as FormData;
    assert.equal(form.get("cidade"), "8847");
    assert.equal(await (form.get("f1") as Blob).text(), request.xml);
    assert.equal((form.get("f1") as File).name, "nfse.xml");
    assert.equal(
      (init.headers as Record<string, string>)["Content-Type"],
      undefined,
      "boundary é gerado pelo fetch",
    );
    return new Response(
      "<retorno><mensagem><codigo>NFS-e válida para emissão.</codigo></mensagem></retorno>",
      { headers: { "content-type": "text/xml;charset=utf-8" } },
    );
  });
  const result = await postNfse(request);
  assert.equal(called, true);
  assert.equal(result.transport, "ok");
  assert.equal(result.responseComplete, true);
  assert.equal(result.parsed.kind, "teste_ok");
  assert.ok(result.parserVersion);
});

test("endpoint e credenciais inválidos falham antes de transmitir", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => {
    throw new Error("não deve chamar fetch");
  });
  for (const endpointUrl of [
    "https://evil.example/",
    "https://santarosa.atende.net/?pg=rest&service=Outro",
    "https://santarosa.atende.net:7443/?pg=rest&service=WNERestServiceNFSe",
  ]) {
    assert.equal((await postNfse({ ...request, endpointUrl })).transport, "nao_enviado");
  }
  assert.equal((await postNfse({ ...request, login: "inválido" })).transport, "nao_enviado");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("redirecionamento bloqueado conserva status HTTP e incerteza", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
  );
  const result = await postNfse(request);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(result.httpStatus, 302);
  assert.equal(result.transport, "rede");
  assert.equal(result.responseComplete, false);
  assert.equal(result.parsed.kind, "ilegivel");
});

test("HTTP 503 preserva status original e corpo para classificação conservadora", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<retorno><mensagem><codigo>00383 - recusada</codigo></mensagem></retorno>", {
        status: 503,
      }),
  );
  const result = await postNfse(request);
  assert.equal(result.httpStatus, 503);
  assert.equal(result.responseComplete, true);
  assert.match(result.raw, /00383/);
});

test("timeout não é confundido com recusa e não expõe erro ou credencial", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new Error(request.senha)), {
          once: true,
        });
      }),
  );
  const result = await postNfse({ ...request, timeoutMs: 5 });
  assert.equal(result.transport, "timeout");
  assert.equal(result.httpStatus, null);
  assert.equal(result.responseComplete, false);
  assert.ok(!JSON.stringify(result).includes(request.senha));
});

test("limita resposta mesmo sem Content-Length e recusa classificação parcial", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("<retorno><numero_nfse>900</numero_nfse>"));
            controller.enqueue(new Uint8Array(NFSE_MAX_RESPONSE_BYTES));
            controller.close();
          },
        }),
      ),
  );
  const result = await postNfse(request);
  assert.equal(result.transport, "rede");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.responseComplete, false);
  assert.equal(result.parsed.kind, "ilegivel");
  assert.ok(result.raw.length <= NFSE_MAX_RESPONSE_BYTES);
});

test("payload excessivo, município inválido e senha vazia não chegam ao transporte", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => {
    throw new Error("não deve transmitir");
  });
  for (const input of [
    { ...request, xml: "x".repeat(NFSE_MAX_RESPONSE_BYTES + 1) },
    { ...request, cidade: "8847&destino=outro" },
    { ...request, senha: "" },
  ]) {
    const result = await postNfse(input);
    assert.equal(result.transport, "nao_enviado");
    assert.equal(result.httpStatus, null);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("Content-Length excessivo cancela leitura sem classificar corpo parcial", async (t) => {
  let canceled = false;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        }),
        {
          headers: { "content-length": String(NFSE_MAX_RESPONSE_BYTES + 1) },
        },
      ),
  );
  const result = await postNfse(request);
  assert.equal(canceled, true);
  assert.equal(result.transport, "rede");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.responseComplete, false);
  assert.equal(result.raw, "");
});

test("interrupção do corpo mantém HTTP e evidência parcial sem retry nem diagnóstico sensível", async (t) => {
  const prefix = "<retorno><numero_nfse>900</numero_nfse>";
  let sent = false;
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (!sent) {
              sent = true;
              controller.enqueue(new TextEncoder().encode(prefix));
            } else controller.error(new Error(`Authorization ${request.senha}`));
          },
        }),
        { status: 200 },
      ),
  );
  const result = await postNfse(request);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.transport, "rede");
  assert.equal(result.responseComplete, false);
  assert.equal(result.raw, prefix);
  assert.equal(result.parsed.kind, "ilegivel");
  assert.ok(!JSON.stringify(result).includes(request.senha));
});
