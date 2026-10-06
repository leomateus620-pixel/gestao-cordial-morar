import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyPublishError, nextRunLabel } from "./publish-messages";
import { precheckAddressPayload } from "@/lib/imobibrasil/address-precheck";

test("pré-checagem bloqueia acima de 15 e libera até 15", () => {
  assert.match(precheckAddressPayload({ numero: "355,Bl-1/Apt: 201" })!, /17 caracteres.*Complemento/);
  assert.equal(precheckAddressPayload({ numero: "123456789012345", complemento: "Ap 1" }), null);
  assert.equal(precheckAddressPayload({ titulo: "x" }), null);
});

test("traduz erro da Imobi e o local", () => {
  const imobi = friendlyPublishError("O número do endereço deve conter no máximo 15 caracteres.", "355,Bl-1/Apt: 201");
  assert.equal(imobi?.editAddress, true);
  assert.match(imobi!.text, /17 caracteres/);
  const local = friendlyPublishError(precheckAddressPayload({ numero: "1234567890123456" }));
  assert.equal(local?.editAddress, true);
  assert.equal(friendlyPublishError("Outro erro")?.editAddress, false);
});

test("próxima execução", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  assert.equal(nextRunLabel({ action: "media_sync", nextRunAt: "2026-10-06T10:00:00Z" }, false, now), "Fotos aguardando a criação do anúncio");
  assert.equal(nextRunLabel({ action: "publish", nextRunAt: "2026-10-06T10:00:00Z" }, true, now), null);
  assert.match(nextRunLabel({ action: "publish", nextRunAt: "2026-10-06T13:00:00Z" }, true, now, () => "x")!, /Próxima execução: x/);
});
