import { describe, expect, it } from "vitest";
import { computeProportionalRent, daysInCompetence } from "./receipt-proportional";

describe("Aluguel proporcional", () => {
  it("entrada 06/10/2026 com 800,00 → 26 dias, R$ 670,97", () => {
    const r = computeProportionalRent({
      valorMensal: 800,
      competencia: "2026-10",
      kind: "entrada",
      date: "2026-10-06",
    });
    expect(r).toMatchObject({
      ok: true,
      dias: 26,
      diasMes: 31,
      valor: 670.97,
      descricao: "referente aos 26 dias morados em outubro",
    });
  });
  it("saída 15/02 em mês de 28 e de 29 dias", () => {
    expect(daysInCompetence("2026-02")).toBe(28);
    expect(daysInCompetence("2028-02")).toBe(29);
    const a = computeProportionalRent({
      valorMensal: 800,
      competencia: "2026-02",
      kind: "saida",
      date: "2026-02-15",
    });
    const b = computeProportionalRent({
      valorMensal: 800,
      competencia: "2028-02",
      kind: "saida",
      date: "2028-02-15",
    });
    expect(a).toMatchObject({ ok: true, dias: 15, valor: 428.57 });
    expect(b).toMatchObject({ ok: true, dias: 15, valor: 413.79 });
  });
  it("entrada no dia 1 é o mês cheio", () => {
    expect(
      computeProportionalRent({
        valorMensal: 800,
        competencia: "2026-10",
        kind: "entrada",
        date: "2026-10-01",
      }),
    ).toMatchObject({ ok: true, dias: 31, valor: 800 });
  });
  it("dias fora do mês ou data fora da competência dão erro", () => {
    expect(
      computeProportionalRent({
        valorMensal: 800,
        competencia: "2026-10",
        kind: "entrada",
        dias: 0,
      }).ok,
    ).toBe(false);
    expect(
      computeProportionalRent({
        valorMensal: 800,
        competencia: "2026-10",
        kind: "entrada",
        dias: 32,
      }).ok,
    ).toBe(false);
    expect(
      computeProportionalRent({
        valorMensal: 800,
        competencia: "2026-10",
        kind: "entrada",
        date: "2026-11-02",
      }).ok,
    ).toBe(false);
  });
  it("1 dia no singular", () => {
    expect(
      computeProportionalRent({ valorMensal: 800, competencia: "2026-10", kind: "saida", dias: 1 }),
    ).toMatchObject({ descricao: "referente a 1 dia morado em outubro" });
  });
});
