import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAgenciamentos,
  getDefaultAgenciamentoFilters,
  matchesPeriod,
  normalizeAgenciamento,
} from "./agenciamentos.ts";

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

test("intervalo personalizado inclui os dias limite", () => {
  assert.equal(matchesPeriod("2026-09-01T03:30:00.000Z", "personalizado", new Date(), range), true);
  assert.equal(matchesPeriod("2026-09-15T23:00:00.000Z", "personalizado", new Date(), range), true);
});

test("intervalo personalizado exclui dias de fora", () => {
  assert.equal(matchesPeriod("2026-08-31T18:00:00.000Z", "personalizado", new Date(), range), false);
  assert.equal(matchesPeriod("2026-09-16T12:00:00.000Z", "personalizado", new Date(), range), false);
});

test("intervalo aberto em uma das pontas", () => {
  assert.equal(
    matchesPeriod("2026-09-20T12:00:00.000Z", "personalizado", new Date(), {
      dataInicio: "2026-09-01",
    }),
    true,
  );
  assert.equal(
    matchesPeriod("2026-09-20T12:00:00.000Z", "personalizado", new Date(), {
      dataFim: "2026-09-01",
    }),
    false,
  );
});

test("filterAgenciamentos aplica o intervalo personalizado", () => {
  const items = [
    make("a", "2026-08-31T18:00:00.000Z"),
    make("b", "2026-09-01T13:00:00.000Z"),
    make("c", "2026-09-15T20:00:00.000Z"),
    make("d", "2026-09-16T13:00:00.000Z"),
  ];
  const filtered = filterAgenciamentos(items, { periodo: "personalizado", ...range });
  assert.deepEqual(
    filtered.map((item) => item.id).sort(),
    ["b", "c"],
  );
  assert.equal(filterAgenciamentos(items, { periodo: "todos", ...range }).length, 4);
});

test("atalho mes continua funcionando", () => {
  const now = new Date();
  const items = [make("atual", now.toISOString()), make("antigo", "2020-01-15T12:00:00.000Z")];
  const filtered = filterAgenciamentos(items, { periodo: "mes" });
  assert.deepEqual(
    filtered.map((item) => item.id),
    ["atual"],
  );
});

test("filtros padrão zeram o intervalo personalizado", () => {
  const defaults = getDefaultAgenciamentoFilters();
  assert.equal(defaults.periodo, "todos");
  assert.equal(defaults.dataInicio, "");
  assert.equal(defaults.dataFim, "");
});

const ref = new Date("2026-10-02T15:00:00.000Z");

test("dia 01/10 (coluna date) entra em mes, trimestre, ano e últimos 30", () => {
  assert.equal(matchesPeriod("2026-10-01", "mes", ref), true);
  assert.equal(matchesPeriod("2026-10-01", "trimestre", ref), true);
  assert.equal(matchesPeriod("2026-10-01", "ano", ref), true);
  assert.equal(matchesPeriod("2026-10-01", "ultimos_30", ref), true);
  assert.equal(matchesPeriod("2026-09-30", "mes", ref), false);
  assert.equal(matchesPeriod("2026-09-30", "trimestre", ref), false);
});

test("últimos 30 dias usa o calendário de São Paulo", () => {
  assert.equal(matchesPeriod("2026-09-02", "ultimos_30", ref), true);
  assert.equal(matchesPeriod("2026-09-01", "ultimos_30", ref), false);
});

test("personalizado com coluna date", () => {
  const out = { dataInicio: "2026-10-01", dataFim: "2026-10-31" };
  const set = { dataInicio: "2026-09-01", dataFim: "2026-09-30" };
  assert.equal(matchesPeriod("2026-10-01", "personalizado", ref, out), true);
  assert.equal(matchesPeriod("2026-10-01", "personalizado", ref, set), false);
});

test("01/01/2027 entra em ano e 1º trimestre de 2027, não em 2026", () => {
  const jan = new Date("2027-01-01T15:00:00.000Z");
  assert.equal(matchesPeriod("2027-01-01", "ano", jan), true);
  assert.equal(matchesPeriod("2027-01-01", "trimestre", jan), true);
  assert.equal(matchesPeriod("2026-12-31", "ano", jan), false);
  assert.equal(matchesPeriod("2026-12-31", "trimestre", jan), false);
  // referência ainda em 31/12/2026 às 22:00 BRT
  const dez = new Date("2027-01-01T01:00:00.000Z");
  assert.equal(matchesPeriod("2026-12-01", "ano", dez), true);
  assert.equal(matchesPeriod("2026-10-01", "trimestre", dez), true);
});
