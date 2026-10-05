import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRentalPrefill,
  fillEmpty,
  lastDayOfCompetence,
  parseFreeAddress,
  previousCompetence,
} from "./rental-prefill";

test("competência = mês anterior em Brasília", () => {
    assert.equal(previousCompetence(new Date("2026-10-05T13:45:00Z")), "2026-09");
    assert.equal(previousCompetence(new Date("2026-01-01T02:00:00Z")), "2025-11");
    assert.equal(previousCompetence(new Date("2026-01-15T12:00:00Z")), "2025-12");
  });
test("último dia", () => {
    assert.equal(lastDayOfCompetence("2026-09"), "2026-09-30");
    assert.equal(lastDayOfCompetence("2028-02"), "2028-02-29");
  });
test("endereço livre", () => {
    assert.deepEqual(parseFreeAddress("Rua Canadá, n° 995 – Bairro Cidade Nova-Teresina/PI"), {
      logradouro: "Rua Canadá",
      numero: "995",
      bairro: "Cidade Nova",
      cep: "",
    });
  });
test("monta rascunho com comissão e tomador", () => {
    const d = buildRentalPrefill({
      competencia: "2026-09",
      comissaoMensal: 170,
      tenantNome: "Rodrigo Elyel Costa Batista",
      tenantDocumento: "072.513.793-25",
    });
    assert.equal(d.valor, "170,00");
    assert.equal(d.documento, "07251379325");
    assert.equal(d.dataFatoGerador, "2026-09-30");
    assert.ok(d.motivo.length >= 15);
  });
test("não sobrescreve", () => {
    assert.deepEqual(fillEmpty({ a: "x", b: "" }, { a: "y", b: "z" }), { a: "x", b: "z" });
  });
