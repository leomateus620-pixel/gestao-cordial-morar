import assert from "node:assert/strict";
import test from "node:test";
import { computeBonusProgress, summarizeBlockingChecklist } from "./track.ts";
import type { Agenciamento, AgenciamentoChecklist } from "@/types/agenciamento";

const reference = new Date("2026-08-15T12:00:00.000Z");

function checklist(overrides: Partial<AgenciamentoChecklist> = {}): AgenciamentoChecklist {
  return {
    fotosHorizontal: true,
    fotosVertical: true,
    cadastradoMorar: true,
    cadastradoCordial: true,
    fotosDrive: true,
    placaInstalada: false,
    videoRealizado: false,
    validado: false,
    ...overrides,
  };
}

function item(
  id: string,
  overrides: Partial<Agenciamento> = {},
  checklistOverrides: Partial<AgenciamentoChecklist> = {},
): Agenciamento {
  return {
    id,
    tipoImovel: "casa",
    endereco: "Rua 1",
    imobiliaria: "cordial",
    finalidade: "venda",
    proprietarioNome: "Dono",
    proprietarioTelefone: "5555",
    corretorId: "c1",
    corretorNome: "Geandre",
    dataAgenciamento: "2026-08-05T12:00:00.000Z",
    origem: "prospeccao",
    status: "ativo",
    checklist: checklist(checklistOverrides),
    criadoEm: "2026-08-05T12:00:00.000Z",
    atualizadoEm: "2026-08-05T12:00:00.000Z",
    ...overrides,
  } as Agenciamento;
}

test("captações com checklist incompleto não contam e aparecem como bloqueadas", () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => item(`ok-${i}`, {}, { placaInstalada: i < 8 })),
    ...Array.from({ length: 8 }, (_, i) => item(`bloq-${i}`, {}, { fotosVertical: false })),
  ];

  const progress = computeBonusProgress(items, "venda", reference);
  assert.equal(progress.cycleTotal, 18);
  assert.equal(progress.listings, 10);
  assert.equal(progress.signs, 8);
  assert.equal(progress.blocking.blocked, 8);
  assert.equal(progress.blocking.fotosVertical, 8);
  assert.equal(progress.earned, 1);
  assert.equal(progress.nextLevel, 2);
  assert.equal(progress.listingsTarget, 16);
  assert.equal(progress.listingsRemaining, 6);
  assert.equal(progress.signsRemaining, 0);
});

test("trilha aluguel acumula sem reinício mensal", () => {
  const items = Array.from({ length: 25 }, (_, i) =>
    item(`al-${i}`, {
      finalidade: "aluguel",
      dataAgenciamento: i < 11 ? "2026-07-10T12:00:00.000Z" : "2026-08-10T12:00:00.000Z",
    }),
  );

  const progress = computeBonusProgress(items, "aluguel", reference);
  assert.equal(progress.listings, 25);
  assert.equal(progress.earned, 2);
  assert.equal(progress.nextLevel, 3);
  assert.equal(progress.listingsRemaining, 5);
});

test("cancelados e reprovados ficam fora dos bloqueados", () => {
  const summary = summarizeBlockingChecklist([
    item("a", { status: "cancelado" }, { fotosVertical: false }),
    item("b", { status: "reprovado" }, { cadastradoMorar: false }),
    item("c", {}, { cadastradoCordial: false }),
  ]);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.cadastradoCordial, 1);
});
