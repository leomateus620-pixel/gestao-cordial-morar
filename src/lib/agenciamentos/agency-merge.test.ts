import { describe, expect, it } from "vitest";
import { agencyStepFromRow, mergeAgencyUpdate } from "./agency-merge";

describe("mergeAgencyUpdate", () => {
  it("reenviar com etapa vazia não desmarca fotos já registradas", () => {
    const out = mergeAgencyUpdate(
      { fotos_horizontal: true, fotos_drive: true, descricao_imovel: "fotos ja estava no sistema" },
      { fotos_horizontal: false, fotos_drive: false, descricao_imovel: null },
    );
    expect(out.fotos_horizontal).toBe(true);
    expect(out.fotos_drive).toBe(true);
    expect(out.descricao_imovel).toBe("fotos ja estava no sistema");
  });
  it("placa já registrada mantém a foto da placa", () => {
    const out = mergeAgencyUpdate({ placa_instalada: true }, { placa_instalada: false, placa_foto_path: null });
    expect(out.placa_instalada).toBe(true);
    expect("placa_foto_path" in out).toBe(false);
  });
});

describe("agencyStepFromRow", () => {
  it("recarrega o que o corretor preencheu", () => {
    const s = agencyStepFromRow({ finalidade: "aluguel", fotos_vertical: true, descricao_imovel: "x" });
    expect(s.finalidade).toBe("aluguel");
    expect(s.checklist.fotosVertical).toBe(true);
    expect(s.descricao).toBe("x");
  });
});
