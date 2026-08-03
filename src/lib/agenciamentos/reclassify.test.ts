import { describe, expect, it } from "vitest";
import { filterByTrack, getUnclassifiedAgenciamentos, matchesTrack } from "./track";
import { canEditAgenciamento } from "../../services/agenciamentos";
import type { Agenciamento } from "../../types/agenciamento";

function makeAgenciamento(overrides: Partial<Agenciamento> = {}): Agenciamento {
  return {
    id: "ag-1",
    tipoImovel: "casa",
    endereco: "Rua das Flores, 100",
    imobiliaria: "cordial",
    finalidade: "venda",
    proprietarioNome: "Maria",
    proprietarioTelefone: "5199999999",
    corretorId: "user-corretor",
    corretorNome: "Leonardo",
    dataAgenciamento: "2026-08-01",
    origem: "indicacao",
    status: "novo",
    checklist: {
      fotosRealizadas: false,
      fotosDrive: false,
      placaInstalada: false,
      cadastradoSite: false,
      videoRealizado: false,
      validado: false,
    },
    criadoEm: "2026-08-01T10:00:00.000Z",
    atualizadoEm: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("reclassificação Venda/Aluguel", () => {
  it("move o registro para a trilha de destino após a troca", () => {
    const before = makeAgenciamento({ finalidade: "venda" });
    const after = { ...before, finalidade: "aluguel" as const };

    expect(matchesTrack(before, "venda")).toBe(true);
    expect(matchesTrack(after, "venda")).toBe(false);
    expect(filterByTrack([after], "aluguel")).toHaveLength(1);
  });

  it("classificar um registro esvazia a lista de sem classificação", () => {
    const semClassificacao = makeAgenciamento({ finalidade: undefined });
    expect(getUnclassifiedAgenciamentos([semClassificacao])).toHaveLength(1);
    expect(
      getUnclassifiedAgenciamentos([{ ...semClassificacao, finalidade: "aluguel" }]),
    ).toHaveLength(0);
  });

  it("permite reclassificar mesmo depois de validado", () => {
    const validado = makeAgenciamento({
      status: "validado",
      checklist: { ...makeAgenciamento().checklist, validado: true },
    });

    expect(canEditAgenciamento(validado, { perfil: "corretor", id: "user-corretor" })).toBe(true);
    expect(canEditAgenciamento(validado, { perfil: "secretaria", id: "user-bianca" })).toBe(true);
    expect(canEditAgenciamento(validado, { perfil: "admin_owner", id: "user-admin" })).toBe(true);
  });

  it("mantém o bloqueio para corretor que não é dono do registro", () => {
    const item = makeAgenciamento({ corretorId: "outro", criadoPorId: "outro" });
    expect(canEditAgenciamento(item, { perfil: "corretor", id: "user-corretor" })).toBe(false);
  });
});
