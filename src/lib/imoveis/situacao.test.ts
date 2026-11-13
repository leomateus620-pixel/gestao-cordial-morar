import assert from "node:assert/strict";
import test from "node:test";
import {
  propertySituacao,
  situacaoFilterRank,
  situacaoFromRank,
  situacaoRank,
  sortBySituacao,
} from "./situacao.ts";

test("disponível quando visível e com disponibilidade aceita", () => {
  assert.equal(propertySituacao({}), "disponivel");
  assert.equal(propertySituacao({ exibirImovel: true, disponibilidade: "Sim" }), "disponivel");
  assert.equal(propertySituacao({ disponibilidade: "Disponível " }), "disponivel");
  assert.equal(propertySituacao({ disponibilidade: "disponivel" }), "disponivel");
  assert.equal(propertySituacao({ disponibilidade: "   " }), "disponivel");
  assert.equal(propertySituacao({ exibirImovel: null, disponibilidade: null }), "disponivel");
});

test("desativado por exibir_imovel = false", () => {
  assert.equal(propertySituacao({ exibirImovel: false }), "desativado");
});

test("desativado por disponibilidade fora da lista", () => {
  assert.equal(propertySituacao({ disponibilidade: "Não" }), "desativado");
  assert.equal(propertySituacao({ disponibilidade: "vendido" }), "desativado");
  assert.equal(propertySituacao({ disponibilidade: "Alugado" }), "desativado");
});

test("arquivado vence desativado", () => {
  assert.equal(
    propertySituacao({ archivedAt: "2026-01-01", exibirImovel: false, disponibilidade: "não" }),
    "arquivado",
  );
});

test("rascunho não vira desativado", () => {
  assert.equal(propertySituacao({ isDraft: true, exibirImovel: false }), "disponivel");
  assert.equal(propertySituacao({ isDraft: true, archivedAt: "2026-01-01" }), "arquivado");
});

test("rank, filtro e ordem dos grupos", () => {
  assert.equal(situacaoRank("disponivel"), 0);
  assert.equal(situacaoRank("desativado"), 1);
  assert.equal(situacaoRank("arquivado"), 2);
  assert.equal(situacaoFromRank(1), "desativado");
  assert.equal(situacaoFromRank(undefined), null);
  assert.equal(situacaoFilterRank("todos"), null);
  assert.equal(situacaoFilterRank("disponiveis"), 0);
  assert.equal(situacaoFilterRank("desativados"), 1);
  assert.equal(situacaoFilterRank("arquivados"), 2);
  const sorted = sortBySituacao([
    { id: "a", archivedAt: "x" },
    { id: "b" },
    { id: "c", exibirImovel: false },
    { id: "d" },
  ]);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["b", "d", "c", "a"],
  );
});
