import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { imobiRequest } from "./client.server";
import { IMOBI_PROVIDERS } from "./providers";
import { ImobiApiError } from "./errors";

test("real HTTP simulator isolates accounts and does not repeat ambiguous POST", async () => {
  const calls: Array<{ account: string; method: string; token: string | undefined }> = [];
  const server = createServer((request, response) => {
    const account = request.url?.split("/")[1] ?? "";
    calls.push({ account, method: request.method ?? "", token: request.headers.token as string | undefined });
    if (account === "cordial" && request.method === "POST") {
      // The provider may have committed the operation before the connection broke.
      response.destroy();
      return;
    }
    if (account === "cordial") {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: false, mensagem: "indisponível" }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: true, data: { codigoImovel: "4355161" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const cordial = IMOBI_PROVIDERS.cordial as { baseUrl: string };
  const morar = IMOBI_PROVIDERS.morar as { baseUrl: string };
  const prior = { cordial: cordial.baseUrl, morar: morar.baseUrl };
  const priorTokens = {
    cordial: process.env["IMOBIBRASIL_CORDIAL_TOKEN"],
    morar: process.env["IMOBIBRASIL_MORAR_TOKEN"],
  };
  cordial.baseUrl = `http://127.0.0.1:${address.port}/cordial`;
  morar.baseUrl = `http://127.0.0.1:${address.port}/morar`;
  process.env["IMOBIBRASIL_CORDIAL_TOKEN"] = "cordial-simulator";
  process.env["IMOBIBRASIL_MORAR_TOKEN"] = "morar-simulator";
  try {
    await assert.rejects(
      imobiRequest("cordial", "/imovel/inserir", {
        method: "POST", json: { referencia: "GC-TESTE" }, acquireSlot: async () => {},
      }),
      (error: unknown) => error instanceof ImobiApiError && error.category === "network",
    );
    const morarResult = await imobiRequest("morar", "/imovel/consultar", { acquireSlot: async () => {} });
    assert.equal(morarResult.httpStatus, 200);
    assert.deepEqual(calls.map(({ account, method }) => `${account}:${method}`), ["cordial:POST", "morar:GET"]);
    assert.deepEqual(calls.map(({ token }) => token), ["cordial-simulator", "morar-simulator"]);
  } finally {
    cordial.baseUrl = prior.cordial;
    morar.baseUrl = prior.morar;
    if (priorTokens.cordial === undefined) delete process.env["IMOBIBRASIL_CORDIAL_TOKEN"];
    else process.env["IMOBIBRASIL_CORDIAL_TOKEN"] = priorTokens.cordial;
    if (priorTokens.morar === undefined) delete process.env["IMOBIBRASIL_MORAR_TOKEN"];
    else process.env["IMOBIBRASIL_MORAR_TOKEN"] = priorTokens.morar;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
