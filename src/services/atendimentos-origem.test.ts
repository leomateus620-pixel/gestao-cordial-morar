import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrigem, mapOriginToClient } from "./atendimentos.ts";
import { atendimentoOrigemOptions, atendimentoOrigemLabel } from "../types/atendimento.ts";
import { leadOriginOptions, leadOriginLabel } from "../types/client.ts";

test("reconhece patrocínio", () => {
  for (const v of ["patrocinio", "Patrocínio", "patrocinado", "Tráfego pago", "anúncio pago", "Meta Ads"])
    assert.equal(normalizeOrigem(v), "patrocinio", v);
});
test("demais origens inalteradas", () => {
  for (const v of ["whatsapp", "site", "portal", "porta_fria", "instagram", "email", "ligacao", "outro", "indicacao"])
    assert.equal(normalizeOrigem(v), v, v);
});
test("opção Patrocínio antes de Outro", () => {
  const i = atendimentoOrigemOptions.findIndex((o) => o.value === "patrocinio");
  assert.equal(atendimentoOrigemOptions[i + 1].value, "outro");
  assert.equal(atendimentoOrigemLabel("patrocinio"), "Patrocínio");
  assert.ok(leadOriginOptions.some((o) => o.value === "patrocinio"));
  assert.equal(leadOriginLabel("patrocinio"), "Patrocínio");
});
test("conversão para cliente mantém patrocínio", () => {
  assert.equal(mapOriginToClient("patrocinio"), "patrocinio");
  assert.equal(mapOriginToClient("whatsapp"), "whatsapp");
});
