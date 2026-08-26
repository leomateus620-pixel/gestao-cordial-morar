import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedBonusTransitions, summarizeBonuses } from "./track.ts";
import type { AgenciamentoBonus } from "@/types/agenciamento";

function bonus(status: AgenciamentoBonus["status"], id: string = status): AgenciamentoBonus {
  return {
    id,
    corretorId: "c1",
    corretorNome: "Felipe",
    categoria: "venda",
    nivel: 1,
    listingsCount: 8,
    placasCount: 4,
    status,
    conquistadoEm: new Date().toISOString(),
  };
}

test("summarizeBonuses separa validadas de pendentes e ignora canceladas no total", () => {
  assert.deepEqual(
    summarizeBonuses([
      bonus("pendente", "a"),
      bonus("aprovada", "b"),
      bonus("paga", "c"),
      bonus("cancelada", "d"),
    ]),
    { total: 3, pendentes: 1, validadas: 2, pagas: 1, canceladas: 1 },
  );
});

test("transições permitidas por status", () => {
  assert.deepEqual(getAllowedBonusTransitions("pendente"), ["aprovada", "paga", "cancelada"]);
  assert.deepEqual(getAllowedBonusTransitions("aprovada"), ["paga", "cancelada"]);
  assert.ok(getAllowedBonusTransitions("paga").includes("aprovada"));
  assert.deepEqual(getAllowedBonusTransitions("cancelada"), ["pendente"]);
});
