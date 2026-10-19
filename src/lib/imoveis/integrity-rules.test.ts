import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAdoptDriveFolder,
  isStaleDriveJob,
  isUniquenessConflict,
  manualCodeConflict,
  purposeMatchesOperation,
  reservationCommitError,
} from "./integrity-rules";

const AP = "e1613a15-8f9b-40ac-9eee-573089b6e054";
const CASA = "029558eb-ac11-4199-8d26-ddb2669c3888";

describe("confirmação de reserva", () => {
  it("recusa reserva já confirmada para outro imóvel (caso 1409)", () => {
    const r = { id: "r", status: "committed", property_id: AP, reserved_by: "u", code: "1409" };
    assert.match(reservationCommitError(r, CASA, "u") ?? "", /outro imóvel/);
  });
  it("aceita reserva livre do próprio usuário e re-salvar do mesmo imóvel", () => {
    assert.equal(reservationCommitError({ id: "r", status: "reserved", property_id: null, reserved_by: "u" }, CASA, "u"), null);
    assert.equal(reservationCommitError({ id: "r", status: "committed", property_id: AP, reserved_by: "u" }, AP, "u"), null);
  });
  it("recusa reserva livre de outro usuário e reserva expirada", () => {
    assert.notEqual(reservationCommitError({ id: "r", status: "reserved", property_id: null, reserved_by: "x" }, CASA, "u"), null);
    assert.notEqual(reservationCommitError({ id: "r", status: "expired", property_id: null, reserved_by: "u" }, CASA, "u"), null);
  });
});

describe("código manual", () => {
  it("recusa código já usado em outro imóvel", () => {
    assert.equal(manualCodeConflict({ code: "1409", propertyId: CASA, otherPropertyIds: [AP], reservations: [] }), AP);
  });
  it("recusa código reservado para outro imóvel", () => {
    assert.equal(
      manualCodeConflict({ code: "3408", propertyId: CASA, otherPropertyIds: [], reservations: [{ status: "committed", property_id: AP }] }),
      AP,
    );
  });
  it("aceita o próprio código (1406/3405 e 1385 continuam válidos para o dono)", () => {
    assert.equal(manualCodeConflict({ code: "1406", propertyId: AP, otherPropertyIds: [AP], reservations: [{ status: "committed", property_id: AP }] }), null);
    assert.equal(manualCodeConflict({ code: "1385", propertyId: AP, otherPropertyIds: [], reservations: [{ status: "released", property_id: CASA }] }), null);
  });
});

describe("envio sem loop", () => {
  it("duplicate key é conflito terminal", () => {
    assert.equal(isUniquenessConflict({ code: "23505", message: 'duplicate key value violates unique constraint "ppp_provider_external_id_idx"' }), true);
    assert.equal(isUniquenessConflict(new Error("timeout")), false);
  });
});

describe("finalidade", () => {
  it("aluguel não aceita venda e vice-versa", () => {
    assert.equal(purposeMatchesOperation("aluguel", "venda"), false);
    assert.equal(purposeMatchesOperation("venda", "aluguel"), false);
    assert.equal(purposeMatchesOperation("venda_aluguel", "aluguel"), true);
  });
});

describe("Drive", () => {
  it("não adota pasta de mesmo nome registrada ou marcada para outro imóvel", () => {
    assert.equal(canAdoptDriveFolder({ propertyId: CASA, registeredTo: [AP], appPropertyId: null }), false);
    assert.equal(canAdoptDriveFolder({ propertyId: CASA, registeredTo: [], appPropertyId: AP }), false);
    assert.equal(canAdoptDriveFolder({ propertyId: AP, registeredTo: [AP], appPropertyId: AP }), true);
  });
  it("job processando com lease vencido é retomável", () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    assert.equal(isStaleDriveJob({ status: "processing", lease_expires_at: "2026-10-15T00:00:00Z" }, now), true);
    assert.equal(isStaleDriveJob({ status: "processing", lease_expires_at: "2026-10-19T12:05:00Z" }, now), false);
  });
});
