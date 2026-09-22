import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildUnpublishPatch,
  buildUpdatePatch,
  hasEffectivePatch,
  normalizeLocalField,
} from "./update-contract";

const BASE = {
  finalidade: "venda",
  codigoTipoImovel: "19",
  referencia: "1381",
};

const SNAPSHOT = {
  ...BASE,
  valorImovel: "180000",
  valorIPTU: "1200",
  video: "https://youtu.be/antigo",
  descricaoImovel: "Terreno plano",
  pontosFortesImovel: "Ótima localização",
  dormitorios: "3",
  bairro: "Cruzeiro",
};

test("alteração isolada de preço envia só preço e obrigatórios", () => {
  const patch = buildUpdatePatch({
    full: { ...SNAPSHOT, valorImovel: "195000" },
    snapshot: SNAPSHOT,
    changedFields: ["valor"],
  });
  assert.deepEqual(Object.keys(patch.payload).sort(), [
    "codigoTipoImovel",
    "finalidade",
    "referencia",
    "valorImovel",
  ]);
  assert.deepEqual(patch.changedKeys, ["valorImovel"]);
  assert.deepEqual(patch.clearedKeys, []);
});

test("limpeza explícita de vídeo envia vazio", () => {
  const full = { ...SNAPSHOT };
  delete (full as Record<string, unknown>)["video"];
  const patch = buildUpdatePatch({ full, snapshot: SNAPSHOT, changedFields: ["video"] });
  assert.equal(patch.payload["video"], "");
  assert.deepEqual(patch.clearedKeys, ["video"]);
});

test("campo já vazio no site não gasta escrita", () => {
  const snapshot = { ...SNAPSHOT, video: "" };
  const full = { ...snapshot };
  delete (full as Record<string, unknown>)["video"];
  const patch = buildUpdatePatch({ full, snapshot, changedFields: ["video"] });
  assert.equal(patch.payload["video"], undefined);
  assert.equal(hasEffectivePatch(patch), false);
});

test("zero em contagem é valor, não limpeza", () => {
  const patch = buildUpdatePatch({
    full: { ...SNAPSHOT, dormitorios: "0" },
    snapshot: SNAPSHOT,
    changedFields: ["dormitorios"],
  });
  assert.equal(patch.payload["dormitorios"], "0");
  assert.deepEqual(patch.clearedKeys, []);
});

test("mexer no preço nunca toca pontos fortes nem descrição", () => {
  const patch = buildUpdatePatch({
    full: { ...SNAPSHOT, valorImovel: "195000", pontosFortesImovel: "" },
    snapshot: SNAPSHOT,
    changedFields: ["valor"],
  });
  assert.equal("pontosFortesImovel" in patch.payload, false);
  assert.equal("descricaoImovel" in patch.payload, false);
});

test("descrição e pontos fortes viajam juntos", () => {
  const patch = buildUpdatePatch({
    full: { ...SNAPSHOT, descricaoImovel: "Terreno plano e murado" },
    snapshot: SNAPSHOT,
    changedFields: ["descricaoImovel"],
  });
  assert.equal(patch.payload["descricaoImovel"], "Terreno plano e murado");
  assert.equal(patch.payload["pontosFortesImovel"], "Ótima localização");
});

test("campos internos tocados não entram no corpo", () => {
  const patch = buildUpdatePatch({
    full: SNAPSHOT,
    snapshot: SNAPSHOT,
    changedFields: ["observacaoImovel", "proprietarioTelefone", "corretorNome"],
  });
  assert.deepEqual(Object.keys(patch.payload).sort(), [
    "codigoTipoImovel",
    "finalidade",
    "referencia",
  ]);
  assert.equal(patch.ignoredFields.length, 3);
  assert.equal(hasEffectivePatch(patch), false);
});

test("vínculos de pessoas ficam fora sem alteração explícita", () => {
  const patch = buildUpdatePatch({
    full: { ...SNAPSHOT, codigoProprietario: "555", codigoCorretor: "2133894" },
    snapshot: SNAPSHOT,
    changedFields: ["valor"],
  });
  assert.equal("codigoProprietario" in patch.payload, false);
  assert.equal("codigoCorretor" in patch.payload, false);
});

test("sem lista de campos tocados cai na diferença e nunca limpa", () => {
  const full = { ...SNAPSHOT, valorImovel: "195000" };
  delete (full as Record<string, unknown>)["video"];
  const patch = buildUpdatePatch({ full, snapshot: SNAPSHOT });
  assert.deepEqual(patch.changedKeys, ["valorImovel"]);
  assert.deepEqual(patch.clearedKeys, []);
  assert.equal("video" in patch.payload, false);
});

test("snapshot ausente não transforma campo vazio em limpeza", () => {
  const full = { ...BASE, valorImovel: "195000" };
  const patch = buildUpdatePatch({ full, snapshot: null, changedFields: ["valor", "video"] });
  assert.equal("video" in patch.payload, false);
  assert.equal(patch.payload["valorImovel"], "195000");
});

test("retirada do site usa apenas identidade e exibirImovel", () => {
  const patch = buildUnpublishPatch({ ...SNAPSHOT });
  assert.deepEqual(Object.keys(patch).sort(), [
    "codigoTipoImovel",
    "exibirImovel",
    "finalidade",
    "referencia",
  ]);
  assert.equal(patch["exibirImovel"], "nao");
});

test("nome de coluna e nome de formulário são equivalentes", () => {
  assert.equal(normalizeLocalField("valor_iptu"), "valorIptu");
  assert.equal(normalizeLocalField("valorIptu"), "valorIptu");
});
