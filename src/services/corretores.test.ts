import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorretoresOperationalModel,
  calculateCorretoresSummary,
  getCorretorPeriodRange,
  rankCorretores,
  type CorretoresOperationalSources,
} from "./corretores.ts";
import { formatElapsedSeconds } from "../lib/time/elapsed.ts";

const NOW = new Date("2026-07-28T15:00:00.000Z");

function sources(): CorretoresOperationalSources {
  return {
    roster: [
      { id: "broker-a", nome: "Ana Corretora", iniciais: "AC", agencies: ["cordial"] },
      { id: "broker-b", nome: "Beto Corretor", iniciais: "BC", agencies: ["cordial"] },
    ],
    assignments: [
      {
        id: "cycle-1",
        attendanceId: "attendance-1",
        brokerId: "broker-a",
        assignedAt: "2026-07-02T12:00:00.000Z",
        status: "superseded",
        imobiliaria: "cordial",
      },
      {
        id: "cycle-2",
        attendanceId: "attendance-1",
        brokerId: "broker-a",
        assignedAt: "2026-07-03T12:00:00.000Z",
        status: "opened",
        imobiliaria: "cordial",
      },
    ],
    attendances: [
      {
        id: "attendance-1",
        corretorId: "broker-a",
        clienteNome: "Cliente real",
        status: "em_atendimento",
        pipelineStage: "proposta",
        imobiliaria: "cordial",
        createdAt: "2026-07-01T12:00:00.000Z",
        updatedAt: "2026-07-04T12:00:00.000Z",
      },
    ],
    attendanceHistory: [
      {
        id: "history-1",
        attendanceId: "attendance-1",
        actorId: "broker-a",
        eventType: "pipeline_stage_changed",
        newValue: { pipeline_stage: "proposta" },
        createdAt: "2026-07-04T12:00:00.000Z",
        imobiliaria: "cordial",
      },
      {
        id: "history-duplicate",
        attendanceId: "attendance-1",
        actorId: "broker-a",
        eventType: "pipeline_stage_changed",
        newValue: { pipeline_stage: "proposta" },
        createdAt: "2026-07-05T12:00:00.000Z",
        imobiliaria: "cordial",
      },
    ],
    agenda: [
      {
        id: "visit-1",
        title: "Visita concluída",
        type: "visita",
        status: "concluido",
        startsAt: "2026-07-05T13:00:00.000Z",
        completedAt: "2026-07-05T14:00:00.000Z",
        ownerId: "broker-a",
        participants: [{ userId: "broker-a" }, { userId: "broker-b" }],
        imobiliaria: "cordial",
      },
      {
        id: "next-1",
        title: "Próximo compromisso",
        type: "reuniao",
        status: "confirmado",
        startsAt: "2026-07-29T13:00:00.000Z",
        completedAt: null,
        ownerId: "broker-a",
        participants: [],
        imobiliaria: "cordial",
      },
    ],
    listings: [
      {
        id: "listing-1",
        brokerId: "broker-a",
        createdBy: "broker-b",
        address: "Rua Persistida, 10",
        status: "em_andamento",
        date: "2026-07-01",
        imobiliaria: "cordial",
        checklist: [true, true, true, false, false, false],
      },
    ],
    sales: [
      {
        id: "sale-owned",
        ownerId: "broker-a",
        propertyName: "Imóvel A",
        status: "concluida",
        value: 300_000,
        commissionValue: 9_000,
        date: "2026-07-07",
        imobiliaria: "cordial",
      },
      {
        id: "sale-admin",
        ownerId: "admin-user",
        propertyName: "Não atribuível por texto",
        status: "concluida",
        value: 999_999,
        commissionValue: 99_999,
        date: "2026-07-07",
        imobiliaria: "cordial",
      },
    ],
    commissionInstallments: [
      {
        id: "installment-1",
        saleId: "sale-owned",
        amount: 4_000,
        paid: true,
        paidAt: "2026-07-20",
      },
      {
        id: "installment-2",
        saleId: "sale-owned",
        amount: 5_000,
        paid: false,
        paidAt: null,
      },
    ],
    rentals: [
      {
        id: "rental-1",
        createdBy: "broker-b",
        status: "ativo",
        brand: "cordial",
        monthlyValue: 2_500,
        createdAt: "2026-06-20T12:00:00.000Z",
        startsAt: "2026-06-25",
        endsAt: "2027-06-24",
        closedAt: null,
      },
      {
        id: "rental-admin",
        createdBy: "admin-user",
        status: "ativo",
        brand: "cordial",
        monthlyValue: 8_000,
        createdAt: "2026-07-02T12:00:00.000Z",
        startsAt: "2026-07-02",
        endsAt: "2027-07-01",
        closedAt: null,
      },
    ],
    responses: [
      {
        brokerId: "broker-a",
        averageSeconds: 4_080,
        medianSeconds: 3_600,
        fastestSeconds: 120,
        slowestSeconds: 8_040,
        completedCount: 2,
        pendingCount: 1,
      },
    ],
  };
}

test("period boundaries use calendar periods in America/Sao_Paulo", () => {
  const month = getCorretorPeriodRange("mes", NOW);
  assert.equal(month.start.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(month.end.toISOString(), "2026-08-01T03:00:00.000Z");
  const quarter = getCorretorPeriodRange("trimestre", NOW);
  assert.equal(quarter.start.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(quarter.end.toISOString(), "2026-10-01T03:00:00.000Z");
});

test("aggregates only persisted UUID relationships and deduplicates cycles/events", () => {
  const result = buildCorretoresOperationalModel({
    periodo: "mes",
    agency: "cordial",
    sources: sources(),
    now: NOW,
  });
  const ana = result.rows.find((row) => row.id === "broker-a");
  const beto = result.rows.find((row) => row.id === "broker-b");
  assert.ok(ana);
  assert.ok(beto);
  assert.equal(ana.atendimentosRecebidos, 1, "repeated assignment cycles do not duplicate total");
  assert.equal(ana.atendimentosEmAndamento, 1);
  assert.equal(
    ana.propostasFeitas,
    1,
    "repeated persisted stage events are distinct by attendance",
  );
  assert.equal(ana.visitasRealizadas, 1, "owner plus participant is counted once");
  assert.equal(beto.visitasRealizadas, 1, "agenda participant receives visible activity");
  assert.equal(ana.agenciamentosFeitos, 1, "assigned broker wins over creator fallback");
  assert.equal(beto.agenciamentosFeitos, 0);
  assert.equal(ana.agenciamentosChecklistPercent, 50);
  assert.equal(ana.vendasFechadas, 1);
  assert.equal(ana.valorVendas, 300_000, "admin-owned sale is not joined by free text");
  assert.equal(ana.comissaoPrevista, 9_000);
  assert.equal(ana.comissaoPaga, 4_000);
  assert.equal(beto.alugueisAtribuidos, 1);
  assert.equal(
    beto.alugueisFechados,
    0,
    "active rentals from an older period are not closed deals",
  );
  assert.equal(ana.mediaRespostaSegundos, 4_080);
  assert.equal(ana.respostasPendentes, 1);
  assert.deepEqual(result.unattributed, { sales: 1, rentals: 1 });
});

test("marks paid commission unavailable when a persisted plan is absent", () => {
  const input = sources();
  input.commissionInstallments = [];
  const result = buildCorretoresOperationalModel({
    periodo: "mes",
    agency: "cordial",
    sources: input,
    now: NOW,
  });
  const ana = result.rows.find((row) => row.id === "broker-a");
  assert.ok(ana);
  assert.equal(ana.comissaoPagaDisponivel, false);
  assert.equal(ana.comissaoPaga, null);
  const summary = calculateCorretoresSummary(result.rows);
  assert.equal(summary.comissaoPaga, null);
  assert.equal(summary.comissaoPendente, null);
});

test("unites persisted assignments with created records and excludes old edited records", () => {
  const input = sources();
  input.assignments = [
    {
      id: "shared-cycle",
      attendanceId: "shared-attendance",
      brokerId: "broker-a",
      assignedAt: "2026-07-02T12:00:00.000Z",
      status: "persisted",
      imobiliaria: "cordial",
    },
    {
      id: "assignment-only-cycle",
      attendanceId: "assignment-only",
      brokerId: "broker-a",
      assignedAt: "2026-07-03T12:00:00.000Z",
      status: "persisted",
      imobiliaria: "cordial",
    },
  ];
  input.attendances = [
    {
      id: "shared-attendance",
      corretorId: "broker-a",
      clienteNome: "Compartilhado",
      status: "em_atendimento",
      pipelineStage: "contato",
      imobiliaria: "cordial",
      createdAt: "2026-07-01T12:00:00.000Z",
      updatedAt: "2026-07-04T12:00:00.000Z",
    },
    {
      id: "legacy-created",
      corretorId: "broker-a",
      clienteNome: "Legado criado no perÃ­odo",
      status: "em_atendimento",
      pipelineStage: "contato",
      imobiliaria: "cordial",
      createdAt: "2026-07-05T12:00:00.000Z",
      updatedAt: "2026-07-05T12:00:00.000Z",
    },
    {
      id: "old-edited",
      corretorId: "broker-a",
      clienteNome: "Antigo editado agora",
      status: "em_atendimento",
      pipelineStage: "contato",
      imobiliaria: "cordial",
      createdAt: "2026-06-10T12:00:00.000Z",
      updatedAt: "2026-07-06T12:00:00.000Z",
    },
  ];
  input.attendanceHistory = [];

  const result = buildCorretoresOperationalModel({
    periodo: "mes",
    agency: "cordial",
    sources: input,
    now: NOW,
  });
  const ana = result.rows.find((row) => row.id === "broker-a");
  assert.ok(ana);
  assert.equal(
    ana.atendimentosRecebidos,
    3,
    "shared IDs are deduplicated, assignment-only IDs are included and old edits are excluded",
  );
});

test("ignores proposal history from another agency", () => {
  const input = sources();
  input.attendanceHistory.push({
    id: "history-other-agency",
    attendanceId: "attendance-other-agency",
    actorId: "broker-a",
    eventType: "stage_change",
    newValue: { pipeline_stage: "proposta" },
    createdAt: "2026-07-06T12:00:00.000Z",
    imobiliaria: "morar",
  });

  const result = buildCorretoresOperationalModel({
    periodo: "mes",
    agency: "cordial",
    sources: input,
    now: NOW,
  });
  const ana = result.rows.find((row) => row.id === "broker-a");
  assert.ok(ana);
  assert.equal(ana.propostasFeitas, 1);
});

test("ranking does not manufacture a leader when the selected criterion has no activity", () => {
  const result = buildCorretoresOperationalModel({
    periodo: "mes",
    agency: "cordial",
    sources: { ...sources(), sales: [], commissionInstallments: [], rentals: [] },
    now: NOW,
  });
  const ranked = rankCorretores(result.rows, "contratos");
  assert.ok(ranked.every((row) => row.rankingPosicao == null));
});

test("formats response time with the persisted duration unit", () => {
  assert.equal(formatElapsedSeconds(12 * 60), "12 min");
  assert.equal(formatElapsedSeconds(68 * 60), "1 h 8 min");
  assert.equal(formatElapsedSeconds(135 * 60), "2 h 15 min");
});
