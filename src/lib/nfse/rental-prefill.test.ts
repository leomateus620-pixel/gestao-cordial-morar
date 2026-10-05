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
test("monta rascunho com comissão, proprietário e endereço do imóvel", () => {
  const d = buildRentalPrefill({
    competencia: "2026-09",
    comissaoMensal: 170,
    ownerNome: "Larissa Azevedo Petermann",
    ownerDocumento: "019.398.980-80",
    property: { logradouro: "Avenida Santa Cruz", numero: "81", bairro: "Centro", cidade: "Santa Rosa", cep: null },
  });
  assert.equal(d.valor, "170,00");
  assert.equal(d.nome, "Larissa Azevedo Petermann");
  assert.equal(d.documento, "01939898080");
  assert.equal(d.logradouro, "Avenida Santa Cruz");
  assert.equal(d.cidadeTom, "8847");
  assert.equal(d.cep, "");
  assert.equal(d.dataFatoGerador, "2026-09-30");
  assert.ok(d.motivo.length >= 15);
});
test("não sobrescreve", () => {
    assert.deepEqual(fillEmpty({ a: "x", b: "" }, { a: "y", b: "z" }), { a: "x", b: "z" });
  });
