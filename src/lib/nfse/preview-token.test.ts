import assert from "node:assert/strict";
import test from "node:test";
import { signPreview, snapshotHash, verifyPreview } from "./preview-token.server.ts";

const actor = "operador-fixture";
const secret = "chave-exclusivamente-sintetica-de-teste";
const now = Date.UTC(2026, 9, 5, 12);
function snapshot() {
  return {
    version: 1,
    contractId: "contrato-fixture",
    contractRevision: "2026-09-30T12:00:00Z",
    brand: "cordial",
    issuerIdentity: "12ABC34501DE35",
    configVersion: 7,
    competencia: "2026-09",
    fiscalSettings: { cnpj: "12ABC34501DE35", codigo_item_lista_servico: "1712", aliquota_iss: 3 },
    profile: { operation: "administracao", approvalReference: "Revisão contábil fixture" },
    review: {
      valor: 315,
      dataFatoGerador: "2026-09-30",
      tomador: { documento: "52998224725", logradouro: "Rua fiscal antiga" },
      motivo: "Documentação da prestação histórica",
    },
    reference: {
      source: "payment",
      source_key: "payment:2026-09-30",
      valor_servico: 315,
      contract_snapshot: { comissao_mensal: 315 },
    },
    payload: { teste: true },
  };
}

test("confirmação assinada vincula snapshot, ator, credencial e prazo de 15 minutos", () => {
  const hash = snapshotHash(snapshot());
  const token = signPreview(hash, actor, secret, now);
  assert.equal(verifyPreview(token, hash, actor, secret, now), true);
  assert.equal(verifyPreview(token, hash, actor, secret, now + 14 * 60_000), true);
  assert.equal(verifyPreview(token, hash, actor, secret, now + 15 * 60_000 + 1), false);
  assert.equal(verifyPreview(token, hash, "outro-operador", secret, now), false);
  assert.equal(verifyPreview(token, hash, actor, "credencial-rotacionada", now), false);
  assert.equal(
    verifyPreview(token, hash, actor, secret, now - 1),
    false,
    "prazo artificial maior não é aceito",
  );
});

test("cada alteração material invalida a aprovação anterior", () => {
  const original = snapshot();
  const token = signPreview(snapshotHash(original), actor, secret, now);
  const mutations: ((input: ReturnType<typeof snapshot>) => void)[] = [
    (input) => {
      input.brand = "morar";
    },
    (input) => {
      input.issuerIdentity = "42767687000135";
    },
    (input) => {
      input.competencia = "2026-10";
    },
    (input) => {
      input.review.valor = 420;
    },
    (input) => {
      input.review.dataFatoGerador = "2026-10-01";
    },
    (input) => {
      input.review.tomador.documento = "42767687000135";
    },
    (input) => {
      input.review.tomador.logradouro = "Novo endereço";
    },
    (input) => {
      input.payload.teste = false;
    },
    (input) => {
      input.profile.operation = "intermediacao";
    },
    (input) => {
      input.profile.approvalReference = "Outra aprovação";
    },
    (input) => {
      input.configVersion++;
    },
    (input) => {
      input.fiscalSettings.aliquota_iss = 4;
    },
    (input) => {
      input.reference.source_key = "payment:2026-10-30";
    },
    (input) => {
      input.reference.valor_servico = 999;
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(verifyPreview(token, snapshotHash(changed), actor, secret, now), false);
  }
});

test("hash fornecido pelo cliente e token malformado não substituem assinatura do servidor", () => {
  const hash = snapshotHash(snapshot());
  const token = signPreview(hash, actor, secret, now);
  for (const malformed of [
    "",
    hash,
    `${now + 900_000}.${"0".repeat(64)}`,
    `${now + 900_000}.abc`,
    `${token}.extra`,
    `.${token}`,
    token.replace(/.$/, "x"),
  ]) {
    assert.equal(verifyPreview(malformed, hash, actor, secret, now), false, malformed);
  }
});

test("serialização estável permite reproduzir a referência e o valor históricos", () => {
  const original = snapshot();
  const stored = JSON.stringify(original);
  const reordered = Object.fromEntries(Object.entries(JSON.parse(stored)).reverse());
  assert.equal(snapshotHash(original), snapshotHash(reordered));
  original.review.valor = 999;
  original.reference.contract_snapshot.comissao_mensal = 999;
  const historical = JSON.parse(stored) as ReturnType<typeof snapshot>;
  assert.equal(historical.review.valor, 315);
  assert.equal(historical.reference.contract_snapshot.comissao_mensal, 315);
  assert.notEqual(snapshotHash(original), snapshotHash(historical));
});
