import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRemoteLookup,
  extractRemoteList,
  normalizeCadastralAction,
} from "./reference-lookup";

const item = (id: string, ref: string) => ({
  externalId: id,
  reference: ref,
  raw: { codigoImovel: id, referenciaImovel: ref },
});

test("formato desconhecido nunca vira ausência", () => {
  const read = extractRemoteList({ mensagem: "ok" });
  assert.equal(read.recognized, false);
  const lookup = classifyRemoteLookup({ reads: [read], reference: "1381", complete: false });
  assert.deepEqual(lookup, { kind: "inconclusive", reason: "formato_desconhecido" });
});

test("falha de consulta é inconclusiva", () => {
  const lookup = classifyRemoteLookup({
    reads: [{ items: [], recognized: true }],
    reference: "1381",
    complete: true,
    failed: true,
  });
  assert.deepEqual(lookup, { kind: "inconclusive", reason: "falha_consulta" });
});

test("paginação não esgotada é inconclusiva, não ausência", () => {
  const lookup = classifyRemoteLookup({
    reads: [{ items: [item("1", "999")], recognized: true }],
    reference: "1381",
    complete: false,
  });
  assert.deepEqual(lookup, { kind: "inconclusive", reason: "paginacao_incompleta" });
});

test("paginação percorrida encontra o vínculo na segunda página", () => {
  const lookup = classifyRemoteLookup({
    reads: [
      { items: [item("1", "999")], recognized: true },
      { items: [item("4355160", "1381")], recognized: true },
    ],
    reference: "1381",
    complete: true,
  });
  assert.deepEqual(lookup, { kind: "unique", externalId: "4355160" });
});

test("duas cópias remotas viram duplicidade", () => {
  const lookup = classifyRemoteLookup({
    reads: [{ items: [item("10", "1381"), item("11", "1381")], recognized: true }],
    reference: "1381",
    complete: true,
  });
  assert.equal(lookup.kind, "duplicate");
});

test("ausência comprovada só com paginação esgotada e formato reconhecido", () => {
  const lookup = classifyRemoteLookup({
    reads: [{ items: [item("10", "999")], recognized: true }],
    reference: "1381",
    complete: true,
  });
  assert.deepEqual(lookup, { kind: "absent" });
});

test("lista aceita resultSet.total_data e imoveis", () => {
  assert.equal(
    extractRemoteList({ resultSet: { total_data: [{ codigoImovel: 9, referenciaImovel: "1" }] } })
      .items.length,
    1,
  );
  assert.equal(extractRemoteList({ imoveis: [] }).recognized, true);
});

test("edição e fotos nunca caem na criação quando o ID está ausente", () => {
  assert.equal(normalizeCadastralAction("publish", { external_property_id: "4355160" }), "update");
  assert.equal(
    normalizeCadastralAction("publish", { external_property_id: null, status: "published" }),
    "reconcile",
  );
  assert.equal(
    normalizeCadastralAction("publish", { external_property_id: null, last_synced_at: "2026-09-01" }),
    "reconcile",
  );
  assert.equal(normalizeCadastralAction("publish", {}), "publish");
});
