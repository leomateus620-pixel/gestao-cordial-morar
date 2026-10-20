import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTipoImovel } from "./atendimentos.ts";
import { atendimentoTipoImovelOptions, atendimentoTipoImovelLabel } from "../types/atendimento.ts";
import { propertyTypeOptions } from "../types/client.ts";

test("reconhece variações de kitnet", () => {
  for (const v of ["kitnet", "Kitinete", "quitinete", "KITNET"]) assert.equal(normalizeTipoImovel(v), "kitnet");
});
test("mantém os demais tipos", () => {
  for (const v of ["casa", "apartamento", "sitio_chacara", "outro"]) assert.equal(normalizeTipoImovel(v), v);
});
test("Kitnet logo após Apartamento", () => {
  const i = atendimentoTipoImovelOptions.findIndex((o) => o.value === "apartamento");
  assert.equal(atendimentoTipoImovelOptions[i + 1].value, "kitnet");
  assert.equal(atendimentoTipoImovelLabel("kitnet"), "Kitnet");
  assert.ok(propertyTypeOptions.some((o) => o.value === "kitnet"));
});
