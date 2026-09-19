import test from "node:test";
import assert from "node:assert/strict";
import {
  AMBIGUOUS_ABSENT_CONFIRMATIONS,
  canCreateAfterAmbiguity,
  decideFromMatches,
  extractRemoteListItems,
  matchByReference,
  normalizeCadastralAction,
  normalizeReference,
} from "./reference-lookup";

const item = (id: number, ref: string | number) => ({ codigoImovel: id, referenciaImovel: ref });

test("lê array puro", () => {
  const items = extractRemoteListItems([item(4355160, 1381)]);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.externalId, "4355160");
});

test("lê resultSet array", () => {
  const items = extractRemoteListItems({ status: true, resultSet: [item(1, "1381")] });
  assert.equal(items.length, 1);
});

test("lê resultSet.data", () => {
  const items = extractRemoteListItems({ resultSet: { data: [item(2, "1381")] } });
  assert.equal(items[0]!.externalId, "2");
});

test("lê resultSet.total_data — forma que o parser antigo ignorava", () => {
  const items = extractRemoteListItems({ resultSet: { total_data: [item(3, "1381")] } });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.reference, "1381");
});

test("lê root.data e root.imoveis", () => {
  assert.equal(extractRemoteListItems({ data: [item(4, "1381")] }).length, 1);
  assert.equal(extractRemoteListItems({ imoveis: [item(5, "1381")] }).length, 1);
});

test("payload desconhecido não vira match", () => {
  assert.deepEqual(extractRemoteListItems({ foo: "bar" }), []);
  assert.deepEqual(extractRemoteListItems(null), []);
});

test("normaliza referência (caixa, espaços, zeros à esquerda)", () => {
  assert.equal(normalizeReference(" 01381 "), "1381");
  assert.equal(normalizeReference("gc-abc"), "GC-ABC");
});

test("match exato por referência", () => {
  const items = extractRemoteListItems({
    resultSet: { total_data: [item(10, "1381"), item(11, "13810"), { codigoImovel: 12 }] },
  });
  const match = matchByReference(items, "1381");
  assert.deepEqual(match.ids, ["10"]);
});

test("0 match = ausente; 1 match = reutiliza", () => {
  assert.deepEqual(decideFromMatches({ ids: [], count: 0 }, null), { kind: "absent" });
  assert.deepEqual(decideFromMatches({ ids: ["9"], count: 1 }, null), {
    kind: "reuse",
    externalId: "9",
  });
});

test(">1 match bloqueia criação e usa o ID local como canônico quando bate", () => {
  const dup = decideFromMatches({ ids: ["9", "10"], count: 2 }, "10");
  assert.deepEqual(dup, { kind: "duplicate", ids: ["9", "10"], canonicalId: "10" });
  const blocked = decideFromMatches({ ids: ["9", "10"], count: 2 }, null);
  assert.equal(blocked.kind === "duplicate" && blocked.canonicalId, null);
});

test("publish em imóvel com ID remoto vira update", () => {
  assert.equal(normalizeCadastralAction("publish", { external_property_id: "4355160" }), "update");
});

test("publish com histórico publicado e sem ID vira reconcile", () => {
  assert.equal(
    normalizeCadastralAction("publish", { external_property_id: null, status: "published" }),
    "reconcile",
  );
  assert.equal(
    normalizeCadastralAction("publish", {
      external_property_id: null,
      last_synced_at: "2026-09-18T19:00:00Z",
    }),
    "reconcile",
  );
});

test("publish inédito continua publish; outras ações não mudam", () => {
  assert.equal(normalizeCadastralAction("publish", { external_property_id: null }), "publish");
  assert.equal(normalizeCadastralAction("update", { external_property_id: null }), "update");
});

test("criação ambígua só libera novo insert após leituras consecutivas de ausência", () => {
  assert.equal(canCreateAfterAmbiguity({ create_state: null }), true);
  assert.equal(canCreateAfterAmbiguity({ create_state: "remote_duplicate_detected" }), false);
  assert.equal(
    canCreateAfterAmbiguity({ create_state: "awaiting_create_reconcile", create_absent_checks: 1 }),
    false,
  );
  assert.equal(
    canCreateAfterAmbiguity({
      create_state: "awaiting_create_reconcile",
      create_absent_checks: AMBIGUOUS_ABSENT_CONFIRMATIONS,
    }),
    true,
  );
});
