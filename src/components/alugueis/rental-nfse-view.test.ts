import test from "node:test";
import assert from "node:assert/strict";
import {
  fiscalStatusView,
  formatFiscalMoney,
  groupFiscalHistory,
  isCurrentFiscalConfirmation,
} from "./rental-nfse-view.ts";

test("fiscal amounts preserve cents in previews and history", () => {
  assert.match(formatFiscalMoney(125.47), /125,47$/);
  assert.match(formatFiscalMoney(0), /0,00$/);
});

test("a failure before transmission is distinct from provider rejection", () => {
  const row = { status: "erro" as const, createdAt: "2026-10-05", updatedAt: null };
  assert.equal(
    fiscalStatusView({ ...row, failureStage: "antes_envio" }).label,
    "Envio não iniciado",
  );
  assert.equal(fiscalStatusView({ ...row, failureStage: "recusa" }).label, "Recusada");
});

test("an abandoned request is shown as awaiting confirmation on reopen, never sending forever", () => {
  const row = {
    status: "processando" as const,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: null,
  };
  assert.equal(fiscalStatusView(row, Date.parse("2026-10-05T12:00:30Z")).icon, "sending");
  assert.equal(fiscalStatusView(row, Date.parse("2026-10-05T12:03:00Z")).icon, "waiting");
  assert.equal(fiscalStatusView({ ...row, createdAt: "invalid" }).icon, "waiting");
});

test("issued, validated test, cancelled and manually resolved have distinct meanings", () => {
  const icons = ["emitida", "teste_ok", "cancelada", "nao_emitida"].map(
    (status) =>
      fiscalStatusView({ status: status as "emitida", createdAt: "2026-10-05", updatedAt: null })
        .icon,
  );
  assert.equal(new Set(icons).size, 4);
});

test("history groups fiscal competence instead of the order in which attempts occurred", () => {
  const result = groupFiscalHistory([
    { competencia: "2026-08-01", createdAt: "2026-10-05", id: "retry" },
    { competencia: "2026-09-01", createdAt: "2026-09-05", id: "newer-service" },
    { competencia: "2026-08-01", createdAt: "2026-08-05", id: "original" },
  ]);
  assert.deepEqual(
    result.map(([month, rows]) => [month, rows.map((row) => row.id)]),
    [
      ["2026-09", ["newer-service"]],
      ["2026-08", ["retry", "original"]],
    ],
  );
});

test("changing preview or clearing competence invalidates the local real-note confirmation", () => {
  assert.equal(isCurrentFiscalConfirmation("server-token-v1", "server-token-v1"), true);
  assert.equal(isCurrentFiscalConfirmation("server-token-v1", "server-token-v2"), false);
  assert.equal(isCurrentFiscalConfirmation("server-token-v1", null), false);
  assert.equal(isCurrentFiscalConfirmation(null, "server-token-v1"), false);
});
