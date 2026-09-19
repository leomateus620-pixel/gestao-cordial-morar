import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideFromMatches,
  matchByReference,
  extractRemoteListItems,
  normalizeCadastralAction,
  canCreateAfterAmbiguity,
  AMBIGUOUS_ABSENT_CONFIRMATIONS,
} from "./reference-lookup";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("lista do site no formato resultSet.total_data é lida corretamente", () => {
  const items = extractRemoteListItems({
    resultSet: { total_data: [{ referenciaImovel: "1381", codigoImovel: "4355160" }] },
  });
  assert.equal(items.length, 1);
  const match = matchByReference(items, "1381");
  assert.deepEqual(match.ids, ["4355160"]);
  assert.equal(decideFromMatches(match, null).kind, "reuse");
});

test("mais de um anúncio na mesma referência bloqueia criação", () => {
  const match = matchByReference(
    [
      { externalId: "4355160", reference: "1381", raw: {} },
      { externalId: "4399999", reference: "1381", raw: {} },
    ],
    "1381",
  );
  const decision = decideFromMatches(match, "4355160");
  assert.equal(decision.kind, "duplicate");
  assert.equal(decision.kind === "duplicate" && decision.canonicalId, "4355160");
});

test("imóvel já publicado: publicar nunca cria, vira atualização", () => {
  const action = normalizeCadastralAction("publish", {
    external_property_id: "4355160",
    status: "published",
    last_synced_at: "2026-09-19T12:00:00Z",
  });
  assert.equal(action, "update");
});

test("sem código remoto mas com histórico: primeiro reconcilia", () => {
  const action = normalizeCadastralAction("publish", {
    external_property_id: null,
    status: "published",
    last_synced_at: "2026-09-19T12:00:00Z",
  });
  assert.equal(action, "reconcile");
});

test("criação sem resposta só pode ser repetida após leituras seguidas de ausência", () => {
  assert.equal(canCreateAfterAmbiguity("awaiting_create_reconcile", 1), false);
  assert.equal(
    canCreateAfterAmbiguity("awaiting_create_reconcile", AMBIGUOUS_ABSENT_CONFIRMATIONS),
    true,
  );
  assert.equal(canCreateAfterAmbiguity(null, 0), true);
});

test("criação passa obrigatoriamente pela trava antes do inserir", () => {
  const source = read("./sync.server.ts");
  const lockAt = source.indexOf("property_publication_acquire_create_lock");
  const insertAt = source.indexOf('"/imovel/inserir"');
  assert.ok(lockAt > 0 && insertAt > lockAt, "a trava deve ser adquirida antes de inserir");
  assert.ok(source.includes("allowRetry: false"), "inserir nunca repete cegamente");
  assert.ok(source.includes("awaiting_create_reconcile"));
  assert.ok(source.includes("remote_duplicate_detected"));
});

test("envio de fotos nunca mexe no cadastro do imóvel", () => {
  const source = read("./media-sync.server.ts");
  assert.ok(!source.includes("/imovel/alterar"));
  assert.ok(!source.includes("/imovel/inserir"));
});

test("fila de fotos é coalescida por rotina do banco", () => {
  assert.ok(read("./media-sync.server.ts").includes("queue_media_sync_coalesced"));
  assert.ok(read("./media-sync.server.ts").includes("property_media_finish"));
  assert.ok(read("./image-retry.server.ts").includes("queue_media_sync_coalesced"));
});
