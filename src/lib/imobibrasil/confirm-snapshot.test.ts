import { strict as assert } from "node:assert";
import test from "node:test";
import { confirmedSnapshotAfterSend } from "./confirm-snapshot";
import { buildUpdatePatch } from "./update-contract";

test("campo recusado pelo site não entra como confirmado", () => {
  const next = confirmedSnapshotAfterSend({
    mode: "update",
    base: { valor: "100", descricao: "a" },
    full: {},
    sent: { valor: "200", descricao: "b" },
    sentKeys: ["valor", "descricao"],
    notConfirmed: new Set(["descricao"]),
  });
  assert.equal(next.valor, "200");
  assert.equal("descricao" in next, false);
});

test("campo não verificável também fica fora da referência", () => {
  const next = confirmedSnapshotAfterSend({
    mode: "insert",
    base: null,
    full: { valor: "1", localChave: "x" },
    sent: {},
    sentKeys: [],
    notConfirmed: new Set(["localChave"]),
  });
  assert.deepEqual(next, { valor: "1" });
});

test("pendência anterior volta no próximo envio mesmo sem ser tocada", () => {
  const patch = buildUpdatePatch({
    full: { finalidade: "venda", codigoTipoImovel: "1", referencia: "R1", descricao: "b", valor: "200" },
    snapshot: { finalidade: "venda", codigoTipoImovel: "1", referencia: "R1", valor: "100" },
    changedFields: ["valor"],
    pendingKeys: ["descricao"],
  });
  assert.equal(patch.payload["descricao"], "b");
  assert.ok(patch.changedKeys.includes("descricao"));
});

test("pendência nunca libera vínculo de pessoa", () => {
  const patch = buildUpdatePatch({
    full: { finalidade: "venda", codigoTipoImovel: "1", referencia: "R1", codigoProprietario: "9", valor: "2" },
    snapshot: { finalidade: "venda", codigoTipoImovel: "1", referencia: "R1", valor: "1" },
    changedFields: ["valor"],
    pendingKeys: ["codigoProprietario"],
  });
  assert.equal("codigoProprietario" in patch.payload, false);
});
