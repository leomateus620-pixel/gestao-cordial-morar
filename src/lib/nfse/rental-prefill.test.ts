import { describe, expect, it } from "vitest";
import {
  buildRentalPrefill,
  fillEmpty,
  lastDayOfCompetence,
  parseFreeAddress,
  previousCompetence,
} from "./rental-prefill";

describe("rental prefill", () => {
  it("competência = mês anterior em Brasília", () => {
    expect(previousCompetence(new Date("2026-10-05T13:45:00Z"))).toBe("2026-09");
    expect(previousCompetence(new Date("2026-01-01T02:00:00Z"))).toBe("2025-11");
    expect(previousCompetence(new Date("2026-01-15T12:00:00Z"))).toBe("2025-12");
  });
  it("último dia", () => {
    expect(lastDayOfCompetence("2026-09")).toBe("2026-09-30");
    expect(lastDayOfCompetence("2028-02")).toBe("2028-02-29");
  });
  it("endereço livre", () => {
    expect(parseFreeAddress("Rua Canadá, n° 995 – Bairro Cidade Nova-Teresina/PI")).toEqual({
      logradouro: "Rua Canadá",
      numero: "995",
      bairro: "Cidade Nova",
      cep: "",
    });
  });
  it("monta rascunho com comissão e tomador", () => {
    const d = buildRentalPrefill({
      competencia: "2026-09",
      comissaoMensal: 170,
      tenantNome: "Rodrigo Elyel Costa Batista",
      tenantDocumento: "072.513.793-25",
    });
    expect(d.valor).toBe("170,00");
    expect(d.documento).toBe("07251379325");
    expect(d.dataFatoGerador).toBe("2026-09-30");
    expect(d.motivo.length).toBeGreaterThanOrEqual(15);
  });
  it("não sobrescreve", () => {
    expect(fillEmpty({ a: "x", b: "" }, { a: "y", b: "z" })).toEqual({ a: "x", b: "z" });
  });
});
