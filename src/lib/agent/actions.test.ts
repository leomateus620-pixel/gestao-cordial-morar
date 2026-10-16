import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionTypes,
  actionSchemas,
  parseActionPayload,
  assertActionMutable,
  actionIsExpired,
  actionBots,
} from "./actions";
import {
  toActionProposal,
  prepareAssistantAction,
  validateActionReferences,
} from "./actions.server";
const id = "10000000-0000-4000-8000-000000000001";
test("closed action schemas never accept transport, fiscal, portal or hidden business fields", () => {
  assert.deepEqual(actionTypes, [
    "agenda_event",
    "attendance_note",
    "attendance_stage_change",
    "shared_selection",
    "message_draft",
  ]);
  const agenda = {
    title: "Visita",
    kind: "visita",
    agency: "cordial",
    start: "2026-11-02T10:00:00-03:00",
    end: "2026-11-02T11:00:00-03:00",
  };
  assert(actionSchemas.agenda_event.safeParse(agenda).success);
  for (const field of [
    "convidados",
    "recipients",
    "whatsapp",
    "photoScope",
    "propertyAddress",
    "serviceRole",
    "execute",
    "nfse",
  ])
    assert(!actionSchemas.agenda_event.safeParse({ ...agenda, [field]: "untrusted" }).success);
  assert(!actionSchemas.agenda_event.safeParse({ ...agenda, end: agenda.start }).success);
  assert(
    !actionSchemas.attendance_stage_change.safeParse({ attendanceId: id, to: "perdido" }).success,
  );
  assert(
    actionSchemas.attendance_stage_change.safeParse({
      attendanceId: id,
      to: "perdido",
      reason: "Motivo informado",
    }).success,
  );
  assert(
    !actionSchemas.message_draft.safeParse({ attendanceId: id, text: "Rascunho", send: true })
      .success,
  );
  assert.deepEqual(actionBots.shared_selection, ["match"]);
});
test("expired, stale revision and executed actions cannot be edited or executed again as pending", () => {
  const action = { status: "pending" as const, revision: 2, expiresAt: "2026-10-16T10:00:00Z" };
  assert(actionIsExpired(action, Date.parse("2026-10-16T10:00:00Z")));
  assert.throws(() => assertActionMutable(action, 1, 0), /editada/);
  assert.throws(
    () => assertActionMutable(action, 2, Date.parse("2026-10-16T10:00:01Z")),
    /expirou/,
  );
  assert.throws(() => assertActionMutable({ ...action, status: "executed" }, 2, 0), /pendente/);
});
test("proposal presentation is masked and does not expose scope/proof/expected metadata", () => {
  const payload = parseActionPayload("attendance_note", {
    attendanceId: id,
    text: "Contato fixture@example.invalid CPF 123.456.789-09",
  });
  const action = toActionProposal({
    id,
    type: "attendance_note",
    bot_id: "lead",
    user_id: id,
    scope_key: "secret-scope",
    payload,
    expected_state: { private: "do not show" },
    revision: 1,
    status: "pending",
    expires_at: "2026-10-16T10:00:00Z",
  } as any);
  assert(!JSON.stringify(action).includes("fixture@example.invalid"));
  assert(!JSON.stringify(action).includes("123.456.789-09"));
  assert(!JSON.stringify(action).includes("secret-scope"));
  assert(!JSON.stringify(action).includes("do not show"));
});
test("wrong role or bot cannot even prepare a proposal; model identity comes only from server context", async () => {
  const ctx = {
    supabase: {} as any,
    userId: id,
    roles: ["financeiro"],
    agencies: ["cordial"],
    agentBotId: "lead",
  };
  await assert.rejects(
    () => prepareAssistantAction(ctx, "attendance_note", { attendanceId: id, text: "Test" }),
    /permissão/,
  );
  await assert.rejects(
    () =>
      prepareAssistantAction(
        { ...ctx, roles: ["corretor"], agentBotId: "agenda" },
        "attendance_note",
        { attendanceId: id, text: "Test" },
      ),
    /agente/,
  );
  await assert.rejects(
    () =>
      prepareAssistantAction(
        { ...ctx, roles: ["corretor"], agentBotId: undefined },
        "attendance_note",
        { attendanceId: id, text: "Test" },
      ),
    /agente/,
  );
});
test("linked visit validates the canonical client/property and resolves the converted client without trusting model names", async () => {
  const client = "20000000-0000-4000-8000-000000000001",
    property = "30000000-0000-4000-8000-000000000001";
  const records: Record<string, any[]> = {
    attendances: [
      {
        id,
        cliente_id: null,
        cliente_convertido_id: client,
        imovel_id: property,
        imobiliaria: "cordial",
        pipeline_stage: "primeiro_contato",
        updated_at: "2026-11-01T10:00:00Z",
      },
    ],
    clients: [{ id: client }],
    properties: [{ id: property }],
  };
  const ctx = {
    userId: id,
    roles: ["admin"],
    agencies: ["cordial"],
    supabase: {
      from(table: string) {
        const q: any = {
          select: () => q,
          eq: () => q,
          limit: () => q,
          in: () => q,
          is: () => q,
          then(resolve: any) {
            return Promise.resolve({ data: records[table] ?? [], error: null }).then(resolve);
          },
        };
        return q;
      },
      rpc: async (name: string, params: any) => {
        assert.equal(name, "current_user_has_notification_agency_access");
        assert.deepEqual(params, { _agency: "cordial" });
        return { data: true, error: null };
      },
    } as any,
  };
  const payload = parseActionPayload("agenda_event", {
    title: "Visita",
    kind: "visita",
    agency: "cordial",
    attendanceId: id,
    start: "2026-11-02T10:00:00-03:00",
    end: "2026-11-02T11:00:00-03:00",
  });
  const expected = await validateActionReferences(ctx, "agenda_event", payload);
  assert("clientId" in payload && payload.clientId === client);
  assert("propertyId" in payload && payload.propertyId === property);
  assert.equal(expected.pipelineStage, "primeiro_contato");
  await assert.rejects(
    () => validateActionReferences(ctx, "agenda_event", { ...payload, clientId: id }),
    /corresponder/,
  );
});
