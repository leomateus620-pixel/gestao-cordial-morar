import assert from "node:assert/strict";
import test from "node:test";
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
      fotosHorizontal: false,
      fotosDrive: false,
      placaInstalada: false,
      cadastradoMorar: false,
      videoRealizado: false,
      validado: false,
    },
    criadoEm: "2026-08-01T10:00:00.000Z",
    atualizadoEm: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

test("move o registro para a trilha de destino após a troca", () => {
  const before = makeAgenciamento({ finalidade: "venda" });
  const after = { ...before, finalidade: "aluguel" as const };

  assert.equal(matchesTrack(before, "venda"), true);
  assert.equal(matchesTrack(after, "venda"), false);
  assert.equal(filterByTrack([after], "aluguel").length, 1);
});

test("classificar um registro esvazia a lista de sem classificação", () => {
  const semClassificacao = makeAgenciamento({ finalidade: undefined });
  assert.equal(getUnclassifiedAgenciamentos([semClassificacao]).length, 1);
  assert.equal(
    getUnclassifiedAgenciamentos([{ ...semClassificacao, finalidade: "aluguel" }]).length,
    0,
  );
});

test("permite reclassificar mesmo depois de validado", () => {
  const validado = makeAgenciamento({
    status: "validado",
    checklist: { ...makeAgenciamento().checklist, validado: true },
  });

  assert.equal(canEditAgenciamento(validado, { perfil: "corretor", id: "user-corretor" }), true);
  assert.equal(canEditAgenciamento(validado, { perfil: "secretaria", id: "user-bianca" }), true);
  assert.equal(canEditAgenciamento(validado, { perfil: "admin_owner", id: "user-admin" }), true);
});

test("mantém o bloqueio para corretor que não é dono do registro", () => {
  const item = makeAgenciamento({ corretorId: "outro", criadoPorId: "outro" });
  assert.equal(canEditAgenciamento(item, { perfil: "corretor", id: "user-corretor" }), false);
});

