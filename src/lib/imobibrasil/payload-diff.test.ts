import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PERSON_LINK_KEYS,
  REQUIRED_UPDATE_KEYS,
  buildMinimalUpdate,
  hasEffectiveChange,
  isKnownLink,
  remoteToPayloadSnapshot,
  sameValue,
} from "./payload-diff";

const syncSource = readFileSync("src/lib/imobibrasil/sync.server.ts", "utf8");

const full = {
  finalidade: "venda",
  codigoTipoImovel: "12",
  referencia: "1381",
  valorImovel: "185000",
  descricao: "Terreno plano",
  bairro: "Centro",
  codigoProprietario: "0",
  codigoCorretor: "2133894",
};

test("só o campo alterado vai no corpo, com os obrigatórios do contrato", () => {
  const snapshot = { ...full, valorImovel: "180000" };
  const update = buildMinimalUpdate(full, snapshot);
  assert.deepEqual(update.changedKeys, ["valorImovel"]);
  assert.deepEqual(Object.keys(update.payload).sort(), [
    "codigoTipoImovel",
    "finalidade",
    "referencia",
    "valorImovel",
  ]);
  assert.equal(hasEffectiveChange(update), true);
});

test("vínculos de pessoas nunca são reenviados sem pedido explícito", () => {
  const update = buildMinimalUpdate(full, { ...full, descricao: "outro" });
  for (const key of PERSON_LINK_KEYS) assert.equal(key in update.payload, false);
  assert.ok(update.preservedLinks.includes("codigoProprietario"));
  assert.ok(update.preservedLinks.includes("codigoCorretor"));
});

test("nada mudou: nenhuma escrita externa é feita", () => {
  const update = buildMinimalUpdate(full, { ...full });
  assert.deepEqual(update.changedKeys, []);
  assert.equal(hasEffectiveChange(update), false);
});

test("campo desconhecido no retrato entra uma vez com o valor local, nunca vazio", () => {
  const update = buildMinimalUpdate(full, { finalidade: "venda", codigoTipoImovel: "12" });
  assert.ok(update.changedKeys.includes("bairro"));
  assert.equal(update.payload["bairro"], "Centro");
});

test("campo local vazio e desconhecido no retrato não é enviado (vazio limparia)", () => {
  const update = buildMinimalUpdate({ ...full, video: "" }, { ...full });
  assert.equal("video" in update.payload, false);
});

test("comparação tolerante evita reenvio por formatação", () => {
  assert.equal(sameValue("1.500", "1500"), true);
  assert.equal(sameValue("10,00", "10"), true);
  assert.equal(sameValue("Sim", "sim"), true);
  assert.equal(sameValue(null, ""), true);
  assert.equal(sameValue("180000", "185000"), false);
});

test("retrato inicial vem do site, não de valores padrão", () => {
  const snapshot = remoteToPayloadSnapshot({
    resultSet: [
      {
        referenciaImovel: 1381,
        valorEsperado: 180000,
        exibirImovel: true,
        endereco: { bairro: "Centro", cidade: "Santa Rosa" },
        area: { privativa: { valor: null } },
      },
    ],
  });
  assert.equal(snapshot["referencia"], "1381");
  assert.equal(snapshot["valorImovel"], "180000");
  assert.equal(snapshot["exibirImovel"], "sim");
  assert.equal(snapshot["bairro"], "Centro");
  assert.equal(snapshot["areaPrivativa"], "");
});

test("vínculo zerado ou ausente é desconhecido, jamais zero", () => {
  assert.equal(isKnownLink("0"), false);
  assert.equal(isKnownLink(""), false);
  assert.equal(isKnownLink(null), false);
  assert.equal(isKnownLink("2133894"), true);
});

test("obrigatórios do contrato conferem com a documentação", () => {
  assert.deepEqual([...REQUIRED_UPDATE_KEYS], ["finalidade", "codigoTipoImovel", "referencia"]);
});

test("a alteração no worker usa o corpo mínimo, não o cadastro inteiro", () => {
  assert.ok(syncSource.includes("buildMinimalUpdate"));
  assert.ok(syncSource.includes("last_payload_snapshot"));
  assert.ok(syncSource.includes('assertWriteAllowed("update"'));
  assert.ok(syncSource.includes('assertWriteAllowed("unpublish"'));
});
