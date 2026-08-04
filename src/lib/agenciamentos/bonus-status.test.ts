import { describe, expect, it } from "vitest";
import { getAllowedBonusTransitions, summarizeBonuses } from "./track";
import type { AgenciamentoBonus } from "@/types/agenciamento";

function bonus(status: AgenciamentoBonus["status"], id = status): AgenciamentoBonus {
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

describe("summarizeBonuses", () => {
  it("separa validadas de pendentes e ignora canceladas no total", () => {
    const summary = summarizeBonuses([
      bonus("pendente", "a"),
      bonus("aprovada", "b"),
      bonus("paga", "c"),
      bonus("cancelada", "d"),
    ]);
    expect(summary).toEqual({
      total: 3,
      pendentes: 1,
      validadas: 2,
      pagas: 1,
      canceladas: 1,
    });
  });
});

describe("getAllowedBonusTransitions", () => {
  it("permite aprovar, pagar ou cancelar uma pendente", () => {
    expect(getAllowedBonusTransitions("pendente")).toEqual(["aprovada", "paga", "cancelada"]);
  });

  it("permite pagar ou cancelar uma aprovada", () => {
    expect(getAllowedBonusTransitions("aprovada")).toEqual(["paga", "cancelada"]);
  });

  it("permite reverter uma paga para aprovada", () => {
    expect(getAllowedBonusTransitions("paga")).toContain("aprovada");
  });

  it("permite reabrir uma cancelada", () => {
    expect(getAllowedBonusTransitions("cancelada")).toEqual(["pendente"]);
  });
});
