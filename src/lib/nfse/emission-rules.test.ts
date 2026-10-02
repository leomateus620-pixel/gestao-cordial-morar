import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCompetenciaPermitida,
  buildIdentificador,
  competenciaFromVencimento,
  currentYmSaoPaulo,
  MODO_TESTE_LIGADO_MSG,
  resolveModoTeste,
} from "./emission-rules.ts";

test("identificador determinístico com no máximo 80 caracteres", () => {
  const id = buildIdentificador("cordial", "e971e17a-541f-4277-9a4f-2c98262adb2f", "2026-08", false);
  assert.equal(id, "GC-cordial-e971e17a541f42779a4f2c98262adb2f-202608-1");
  assert.equal(buildIdentificador("cordial", "e971e17a-541f-4277-9a4f-2c98262adb2f", "2026-08", false), id);
  const t = buildIdentificador("morar", "9eb47d1a-a1c0-4dae-9b45-99a34002859c", "2026-09", true);
  assert.ok(t.endsWith("-202609-1-T"));
  assert.ok(id.length <= 80 && t.length <= 80);
});

test("competência lida como texto: vencimento no dia 1 fica no mesmo mês", () => {
  assert.equal(competenciaFromVencimento("2026-09-01", "2026-10"), "2026-09");
  assert.equal(competenciaFromVencimento("2026-12-31T00:00:00Z", "2026-10"), "2026-12");
  assert.equal(competenciaFromVencimento(null, "2026-10"), "2026-10");
});

test("competência mais de 1 mês no futuro é recusada", () => {
  assertCompetenciaPermitida("2026-11", "2026-10");
  assertCompetenciaPermitida("2026-01", "2026-10");
  assert.throws(() => assertCompetenciaPermitida("2026-12", "2026-10"));
  assert.throws(() => assertCompetenciaPermitida("2026-13", "2026-10"));
  assert.match(currentYmSaoPaulo(new Date("2026-10-01T02:00:00Z")), /^2026-09$/);
});

test("trava de modo teste: configuração manda", () => {
  assert.throws(() => resolveModoTeste({ configModoTeste: true, pedidoModoTeste: false, confirmarEmissaoReal: true }), {
    message: MODO_TESTE_LIGADO_MSG,
  });
  assert.equal(resolveModoTeste({ configModoTeste: true }), true);
  assert.equal(resolveModoTeste({ configModoTeste: true, pedidoModoTeste: true }), true);
  assert.equal(resolveModoTeste({ configModoTeste: false }), true, "sem pedido explícito, é teste");
  assert.throws(() => resolveModoTeste({ configModoTeste: false, pedidoModoTeste: false }));
  assert.equal(resolveModoTeste({ configModoTeste: false, pedidoModoTeste: false, confirmarEmissaoReal: true }), false);
});
