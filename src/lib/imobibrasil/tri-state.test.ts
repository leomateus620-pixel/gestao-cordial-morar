import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyField, buildTriStateReport, nextConfirmedSnapshot, isOwnEcho } from "./tri-state";

describe("classifyField", () => {
  it("trata formatos diferentes do mesmo valor como iguais", () => {
    assert.equal(
      classifyField({ field: "valor", confirmed: "450000", local: 450000, remote: "450.000", remoteKnown: true }),
      "igual",
    );
  });

  it("identifica edição só local, só remota e divergência", () => {
    assert.equal(
      classifyField({ confirmed: "a", local: "b", remote: "a", remoteKnown: true }),
      "mudou_local",
    );
    assert.equal(
      classifyField({ confirmed: "a", local: "a", remote: "c", remoteKnown: true }),
      "mudou_remoto",
    );
    assert.equal(
      classifyField({ confirmed: "a", local: "b", remote: "c", remoteKnown: true }),
      "conflito",
    );
  });

  it("separa limpeza intencional local de edição", () => {
    assert.equal(
      classifyField({ confirmed: "texto", local: "", remote: "texto", remoteKnown: true }),
      "limpeza_local",
    );
  });

  it("campo que a leitura não descreve nunca vira vazio", () => {
    assert.equal(
      classifyField({ confirmed: "x", local: "x", remote: undefined, remoteKnown: false }),
      "nao_verificavel",
    );
  });
});

describe("buildTriStateReport", () => {
  it("classifica cada campo e respeita campos protegidos", () => {
    const report = buildTriStateReport(
      { valor: "100", descricao_imovel: "antiga", bairro: "Centro", pontos_fortes: "x" },
      { valor: "100", descricao_imovel: "nova", bairro: "", pontos_fortes: "y" },
      { valor: "200", descricao_imovel: "antiga", bairro: "Centro", pontos_fortes: "z" },
      { protectedFields: ["pontos_fortes"] },
    );
    assert.deepEqual(report.importable.map((f) => f.field), ["valor"]);
    assert.deepEqual(report.localPending.map((f) => f.field), ["descricao_imovel"]);
    assert.deepEqual(report.localClears.map((f) => f.field), ["bairro"]);
    assert.ok(!report.fields.some((f) => f.field === "pontos_fortes"));
  });
});

describe("nextConfirmedSnapshot", () => {
  it("não confirma campo em que a diferença local foi preservada", () => {
    const result = nextConfirmedSnapshot(
      { valor: "100", descricao_imovel: "antiga" },
      { valor: "200", descricao_imovel: "nova" },
      { valor: "200", descricao_imovel: "antiga" },
    );
    assert.equal(result.fullyConfirmed, false);
    assert.equal(result.snapshot["valor"], "200");
    assert.equal(result.snapshot["descricao_imovel"], "antiga");
  });

  it("confirma quando os dois lados ficaram iguais", () => {
    const result = nextConfirmedSnapshot({ valor: "100" }, { valor: "200" }, { valor: "200" });
    assert.equal(result.fullyConfirmed, true);
  });
});

describe("isOwnEcho", () => {
  it("reconhece o próprio envio dentro da validade", () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    assert.equal(isOwnEcho("h1", { hash: "h1", expiresAt: expires }), true);
  });

  it("ignora eco vencido ou de outro conteúdo", () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    assert.equal(isOwnEcho("h1", { hash: "h1", expiresAt: expired }), false);
    assert.equal(isOwnEcho("h2", { hash: "h1", expiresAt: null }), false);
  });
});
