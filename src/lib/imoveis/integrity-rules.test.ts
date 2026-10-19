import { describe, expect, it } from "vitest";
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
    expect(reservationCommitError(r, CASA, "u")).toMatch(/outro imóvel/);
  });
  it("aceita reserva livre do próprio usuário e re-salvar do mesmo imóvel", () => {
    expect(reservationCommitError({ id: "r", status: "reserved", property_id: null, reserved_by: "u" }, CASA, "u")).toBeNull();
    expect(reservationCommitError({ id: "r", status: "committed", property_id: AP, reserved_by: "u" }, AP, "u")).toBeNull();
  });
  it("recusa reserva livre de outro usuário e reserva expirada", () => {
    expect(reservationCommitError({ id: "r", status: "reserved", property_id: null, reserved_by: "x" }, CASA, "u")).not.toBeNull();
    expect(reservationCommitError({ id: "r", status: "expired", property_id: null, reserved_by: "u" }, CASA, "u")).not.toBeNull();
  });
});

describe("código manual", () => {
  it("recusa código já usado em outro imóvel", () => {
    expect(manualCodeConflict({ code: "1409", propertyId: CASA, otherPropertyIds: [AP], reservations: [] })).toBe(AP);
  });
  it("recusa código reservado para outro imóvel", () => {
    expect(
      manualCodeConflict({ code: "3408", propertyId: CASA, otherPropertyIds: [], reservations: [{ status: "committed", property_id: AP }] }),
    ).toBe(AP);
  });
  it("aceita o próprio código (1406/3405 e 1385 continuam válidos para o dono)", () => {
    expect(manualCodeConflict({ code: "1406", propertyId: AP, otherPropertyIds: [AP], reservations: [{ status: "committed", property_id: AP }] })).toBeNull();
    expect(manualCodeConflict({ code: "1385", propertyId: AP, otherPropertyIds: [], reservations: [{ status: "released", property_id: CASA }] })).toBeNull();
  });
});

describe("envio sem loop", () => {
  it("duplicate key é conflito terminal", () => {
    expect(isUniquenessConflict({ code: "23505", message: 'duplicate key value violates unique constraint "ppp_provider_external_id_idx"' })).toBe(true);
    expect(isUniquenessConflict(new Error("timeout"))).toBe(false);
  });
});

describe("finalidade", () => {
  it("aluguel não aceita venda e vice-versa", () => {
    expect(purposeMatchesOperation("aluguel", "venda")).toBe(false);
    expect(purposeMatchesOperation("venda", "aluguel")).toBe(false);
    expect(purposeMatchesOperation("venda_aluguel", "aluguel")).toBe(true);
  });
});

describe("Drive", () => {
  it("não adota pasta de mesmo nome registrada ou marcada para outro imóvel", () => {
    expect(canAdoptDriveFolder({ propertyId: CASA, registeredTo: [AP], appPropertyId: null })).toBe(false);
    expect(canAdoptDriveFolder({ propertyId: CASA, registeredTo: [], appPropertyId: AP })).toBe(false);
    expect(canAdoptDriveFolder({ propertyId: AP, registeredTo: [AP], appPropertyId: AP })).toBe(true);
  });
  it("job processando com lease vencido é retomável", () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    expect(isStaleDriveJob({ status: "processing", lease_expires_at: "2026-10-15T00:00:00Z" }, now)).toBe(true);
    expect(isStaleDriveJob({ status: "processing", lease_expires_at: "2026-10-19T12:05:00Z" }, now)).toBe(false);
  });
});
