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
  assert.equal(next.descricao, "a"); // última confirmação preservada
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

test("limpeza recusada volta a ser enviada na tentativa seguinte", () => {
  const base = { finalidade: "venda", codigoTipoImovel: "1", referencia: "R1", descricaoImovel: "antiga" };
  const next = confirmedSnapshotAfterSend({
    mode: "update", base, full: {}, sent: { descricaoImovel: "" },
    sentKeys: ["descricaoImovel"], notConfirmed: new Set(["descricaoImovel"]),
  });
  assert.equal(next.descricaoImovel, "antiga");
  const patch = buildUpdatePatch({
    full: { finalidade: "venda", codigoTipoImovel: "1", referencia: "R1" },
    snapshot: next, changedFields: [], pendingKeys: ["descricaoImovel"],
  });
  assert.equal(patch.payload["descricaoImovel"], "");
  assert.ok(patch.changedKeys.includes("descricaoImovel"));
});

test("inclusão: valor enviado e divergente não é confirmado", () => {
  const next = confirmedSnapshotAfterSend({
    mode: "insert", base: null, full: { valor: "200", localChave: "x" }, sent: { valor: "200", localChave: "x" },
    sentKeys: ["valor", "localChave"], notConfirmed: new Set(["valor"]),
  });
  assert.equal("valor" in next, false);
  assert.equal(next.localChave, "x");
});
