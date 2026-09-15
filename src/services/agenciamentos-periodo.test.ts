import { describe, expect, it } from "vitest";
import {
  filterAgenciamentos,
  getDefaultAgenciamentoFilters,
  matchesPeriod,
  normalizeAgenciamento,
} from "@/services/agenciamentos";

function make(id: string, dataAgenciamento: string) {
  return normalizeAgenciamento({
    id,
    endereco: `Rua ${id}`,
    proprietarioNome: "Dono",
    proprietarioTelefone: "5599999999",
    corretorId: "c1",
    corretorNome: "Corretor",
    dataAgenciamento,
    imobiliaria: "cordial",
    status: "novo",
  });
}

const range = { dataInicio: "2026-09-01", dataFim: "2026-09-15" };

describe("matchesPeriod personalizado", () => {
  it("inclui os limites do intervalo", () => {
    expect(matchesPeriod("2026-09-01T03:30:00.000Z", "personalizado", new Date(), range)).toBe(true);
    expect(matchesPeriod("2026-09-15T23:00:00.000Z", "personalizado", new Date(), range)).toBe(true);
  });

  it("exclui dias fora do intervalo", () => {
    expect(matchesPeriod("2026-08-31T18:00:00.000Z", "personalizado", new Date(), range)).toBe(
      false,
    );
    expect(matchesPeriod("2026-09-16T12:00:00.000Z", "personalizado", new Date(), range)).toBe(
      false,
    );
  });

  it("aceita apenas uma das datas", () => {
    expect(
      matchesPeriod("2026-09-20T12:00:00.000Z", "personalizado", new Date(), {
        dataInicio: "2026-09-01",
      }),
    ).toBe(true);
    expect(
      matchesPeriod("2026-08-20T12:00:00.000Z", "personalizado", new Date(), {
        dataFim: "2026-09-01",
      }),
    ).toBe(true);
    expect(
      matchesPeriod("2026-09-20T12:00:00.000Z", "personalizado", new Date(), {
        dataFim: "2026-09-01",
      }),
    ).toBe(false);
  });
});

describe("filterAgenciamentos com intervalo personalizado", () => {
  const items = [
    make("a", "2026-08-31T18:00:00.000Z"),
    make("b", "2026-09-01T13:00:00.000Z"),
    make("c", "2026-09-15T20:00:00.000Z"),
    make("d", "2026-09-16T13:00:00.000Z"),
  ];

  it("mantém só o que está no intervalo", () => {
    const result = filterAgenciamentos(items, { periodo: "personalizado", ...range });
    expect(result.map((item) => item.id).sort()).toEqual(["b", "c"]);
  });

  it("ignora datas quando o período é um atalho", () => {
    const result = filterAgenciamentos(items, { periodo: "todos", ...range });
    expect(result).toHaveLength(4);
  });

  it("reset zera o intervalo personalizado", () => {
    const defaults = getDefaultAgenciamentoFilters();
    expect(defaults.periodo).toBe("todos");
    expect(defaults.dataInicio).toBe("");
    expect(defaults.dataFim).toBe("");
  });
});
