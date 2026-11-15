import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atendimento } from "@/types/atendimento";
import type { AgendaEvent } from "@/types/agenda";
import {
  buildDashboardMetrics,
  defaultDashboardPeriods,
  metricIds,
  validateMetricDates,
  isValidMetricMonth,
  type DashboardPeriods,
  type MetricPeriod,
} from "./metrics";
const now = new Date("2026-11-15T15:00:00Z");
const attendance = (date: string, patch: Partial<Atendimento> = {}) =>
  ({
    criadoEm: date,
    pipelineStage: "primeiro_contato",
    finalidade: "compra",
    imobiliaria: "cordial",
    ...patch,
  }) as Atendimento;
const visit = (date: string, patch: Partial<AgendaEvent> = {}) =>
  ({
    inicio: date,
    tipo: "visita",
    status: "agendado",
    imobiliaria: "cordial",
    ...patch,
  }) as AgendaEvent;
const periods = (period: MetricPeriod) =>
  Object.fromEntries(metricIds.map((id) => [id, period])) as DashboardPeriods;
const sum = (metric: ReturnType<typeof buildDashboardMetrics>["atendimentos"]) =>
  metric.buckets.reduce((value, item) => value + item.value, 0);

test("defaults preserve closing-stage clients, active tracks and upcoming visits", () => {
  const result = buildDashboardMetrics(
    [
      attendance("2026-11-01"),
      attendance("2026-11-03", { pipelineStage: "fechamento" }),
      attendance("2026-10-01", { finalidade: "aluguel" }),
      attendance("2026-11-04", { finalidade: "aluguel", pipelineStage: "perdido" }),
      attendance("2026-11-04", { finalidade: "ambos" }),
      attendance("2026-10-04", { pipelineStage: "em_espera" }),
      attendance("2026-10-04", { pipelineStage: "arquivado" }),
    ],
    [
      visit("2026-11-15"),
      visit("2027-01-01"),
      visit("2026-11-14"),
      visit("2026-11-16", { status: "cancelado" }),
      visit("2026-11-16", { status: "concluido" }),
      visit("2026-11-16", { tipo: "fotos" }),
    ],
    defaultDashboardPeriods,
    now,
  );
  assert.deepEqual(
    metricIds.map((id) => result[id].value),
    [4, 1, 1, 2, 2],
  );
  for (const id of metricIds) assert.equal(sum(result[id]), result[id].value);
});

test("custom dates include the full last day in Brasília and exclude adjacent instants", () => {
  const result = buildDashboardMetrics(
    [
      attendance("2026-11-01T02:59:59.999Z"),
      attendance("2026-11-01T03:00:00Z"),
      attendance("2026-12-01T02:59:59.999Z"),
      attendance("2026-12-01T03:00:00Z"),
    ],
    [],
    periods({ kind: "custom", start: "2026-11-01", end: "2026-11-30" }),
    now,
  );
  assert.equal(result.atendimentos.value, 2);
  assert.equal(result.atendimentos.buckets[0].value, 1);
  assert.equal(result.atendimentos.buckets[29].value, 1);
});

test("a period change affects only its own card", () => {
  const list = [
    attendance("2026-10-10", { finalidade: "aluguel" }),
    attendance("2026-11-15", { finalidade: "aluguel" }),
  ];
  const before = buildDashboardMetrics(list, [], defaultDashboardPeriods, now);
  const after = buildDashboardMetrics(
    list,
    [],
    { ...defaultDashboardPeriods, aluguel: { kind: "today" } },
    now,
  );
  assert.equal(before.aluguel.value, 2);
  assert.equal(after.aluguel.value, 1);
  for (const id of metricIds.filter((id) => id !== "aluguel"))
    assert.deepEqual(after[id], before[id]);
});

test("agency applies equally to agenda and attendance, retaining shared records", () => {
  const list = [
    attendance("2026-11-15"),
    attendance("2026-11-15", { imobiliaria: "morar" }),
    attendance("2026-11-15", { imobiliaria: "ambas" }),
  ];
  const events = [
    visit("2026-11-15"),
    visit("2026-11-15", { imobiliaria: "morar" }),
    visit("2026-11-15", { imobiliaria: "ambas" }),
  ];
  const result = buildDashboardMetrics(list, events, defaultDashboardPeriods, now, "morar");
  assert.equal(result.atendimentos.value, 2);
  assert.equal(result.visitas.value, 2);
});

test("month picker handles leap years and January previous-month rollover", () => {
  const result = buildDashboardMetrics(
    [attendance("2024-02-29"), attendance("2024-03-01")],
    [],
    periods({ kind: "selected-month", month: "2024-02" }),
    now,
  );
  assert.equal(result.atendimentos.value, 1);
  assert.equal(result.atendimentos.buckets.length, 29);
  const previous = buildDashboardMetrics(
    [attendance("2025-12-31"), attendance("2026-01-01")],
    [],
    periods({ kind: "previous-month" }),
    new Date("2026-01-02T12:00:00Z"),
  );
  assert.equal(previous.atendimentos.value, 1);
});

test("rolling periods include today and use business day even on a different UTC date", () => {
  const list = [
    attendance("2026-11-08"),
    attendance("2026-11-09"),
    attendance("2026-11-15"),
    attendance("2026-11-16"),
  ];
  const result = buildDashboardMetrics(
    list,
    [],
    periods({ kind: "7d" }),
    new Date("2026-11-16T02:00:00Z"),
  );
  assert.equal(result.atendimentos.value, 2);
  assert.equal(result.atendimentos.buckets.length, 7);
});

test("invalid and undated records never become fictional chart bars", () => {
  const result = buildDashboardMetrics(
    [attendance(""), attendance("invalid"), attendance("2026-02-30"), attendance("2026-11-15")],
    [],
    periods({ kind: "all" }),
    now,
  );
  assert.equal(result.compra.value, 4);
  assert.equal(result.compra.undated, 3);
  assert.equal(sum(result.compra), 1);
  const bounded = buildDashboardMetrics([attendance("")], [], defaultDashboardPeriods, now);
  assert.equal(bounded.atendimentos.value, 0);
});

test("long ranges are bounded, conserve all records and label grouped months honestly", () => {
  const list = Array.from({ length: 400 }, (_, index) =>
    attendance(`${2000 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-15`),
  );
  const result = buildDashboardMetrics(list, [], periods({ kind: "all" }), now).atendimentos;
  assert.equal(sum(result), 400);
  assert.ok(result.buckets.length <= 24);
  assert.equal(result.chartLabel, "Entradas por período");
});

test("empty ranges have zero-height data, no fabricated activity", () => {
  const result = buildDashboardMetrics([], [], defaultDashboardPeriods, now);
  for (const id of metricIds) {
    assert.equal(result[id].value, 0);
    assert.equal(sum(result[id]), 0);
  }
});

test("invalid calendar dates, reversed ranges and invalid months are rejected", () => {
  assert.ok(validateMetricDates("2026-02-30", "2026-03-01"));
  assert.ok(validateMetricDates("2026-11-16", "2026-11-15"));
  assert.ok(validateMetricDates("", "2026-11-15"));
  assert.equal(validateMetricDates("2024-02-29", "2024-02-29"), null);
  assert.equal(isValidMetricMonth("2026-13"), false);
  assert.equal(isValidMetricMonth("2026-2"), false);
});
