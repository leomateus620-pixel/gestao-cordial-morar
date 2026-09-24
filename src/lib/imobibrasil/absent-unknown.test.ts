import { test } from "node:test";
import assert from "node:assert/strict";
import { ABSENT_UNKNOWN_WINDOW_MS, shouldResendAbsentUnknown } from "./media-sync.server";

const now = Date.parse("2026-09-24T14:40:00Z");

test("envio incerto ausente do site volta à fila após a janela", () => {
  const updated_at = new Date(now - ABSENT_UNKNOWN_WINDOW_MS - 1000).toISOString();
  assert.equal(shouldResendAbsentUnknown({ updated_at, verification: {} }, now), true);
});

test("dentro da janela continua aguardando conferência", () => {
  const updated_at = new Date(now - 60_000).toISOString();
  assert.equal(shouldResendAbsentUnknown({ updated_at, verification: null }, now), false);
});

test("reenvio acontece uma única vez", () => {
  const updated_at = new Date(now - 3_600_000).toISOString();
  assert.equal(
    shouldResendAbsentUnknown({ updated_at, verification: { resent_after_absent: true } }, now),
    false,
  );
});
