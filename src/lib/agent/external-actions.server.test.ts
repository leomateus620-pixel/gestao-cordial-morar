import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthContext } from "@lovable.dev/mcp-js";
import {
  externalIdentity,
  externalRequestHash,
  externalConfirmationUrl,
  prepareExternalAction,
  getExternalActionStatus,
} from "./external-actions.server";
import type { AgentContext } from "./security";
const user = "10000000-0000-4000-8000-000000000001",
  client = "20000000-0000-4000-8000-000000000001",
  request = "30000000-0000-4000-8000-000000000001",
  id = "40000000-0000-4000-8000-000000000001";
const identity = { userId: user, clientId: client };
function auth(claims: Record<string, unknown>, resolvedClient = client) {
  return new AuthContext({
    type: "oauth",
    principal: {
      claims,
      issuer: "https://issuer.example",
      resource: "https://gestao.example/mcp",
      acceptedAudiences: ["authenticated"],
      scopes: [],
      sub: user,
      clientId: resolvedClient,
    },
    bearer: { token: "NEVER_RETURN" },
  } as any);
}
function fixture() {
  const state = {
    approved: true,
    available: true,
    revision: 1,
    rows: [] as any[],
    businessReads: 0,
    filters: [] as Array<[string, unknown]>,
  };
  const ctx: AgentContext = {
    userId: user,
    roles: ["corretor"],
    agencies: ["cordial"],
    supabase: {
      async rpc(name: string) {
        return name === "assistant_mcp_client_permission"
          ? {
              data: [{ client_id: client, revision: state.revision, approved: state.approved }],
              error: null,
            }
          : { data: state.available, error: null };
      },
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        if (table !== "assistant_actions") state.businessReads++;
        const q: any = {
          select: () => q,
          in: () => q,
          or: () => q,
          limit: () => q,
          eq: (key: string, value: unknown) => {
            filters.push([key, value]);
            state.filters.push([key, value]);
            return q;
          },
          maybeSingle: async () => ({
            data: state.rows.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null,
            error: null,
          }),
          then(resolve: any) {
            return Promise.resolve({
              data:
                table === "attendances"
                  ? [
                      {
                        id: user,
                        pipeline_stage: "primeiro_contato",
                        updated_at: "2026-10-16T12:00:00Z",
                      },
                    ]
                  : [],
              error: null,
            }).then(resolve);
          },
        };
        return q;
      },
    } as any,
  };
  return { ctx, state };
}
test("external identity uses only verified client_id and rejects absent, azp-only or conflicting identities", () => {
  assert.deepEqual(externalIdentity(auth({ client_id: client })), identity);
  for (const claims of [{}, { azp: client }, { client_id: 123 }, { client_id: " " }])
    assert.throws(() => externalIdentity(auth(claims)), /OAuth/);
  assert.throws(() => externalIdentity(auth({ client_id: client }, "OTHER")), /OAuth/);
  assert.throws(() => externalIdentity(auth({ client_id: client, azp: "OTHER" })), /OAuth/);
  assert.deepEqual(externalIdentity(auth({ client_id: client, azp: client })), identity);
  assert.throws(() => externalIdentity(new AuthContext(undefined)), /OAuth/);
});
test("request hashes normalize raw arguments and preserve distinctions that privacy masking could collapse", async () => {
  const first = await externalRequestHash("prepare_message_draft", {
    attendanceId: user,
    text: "  Contato ana@example.invalid  ",
  });
  assert.equal(
    first,
    await externalRequestHash("prepare_message_draft", {
      text: "Contato ana@example.invalid",
      attendanceId: user,
    }),
  );
  assert.notEqual(
    first,
    await externalRequestHash("prepare_message_draft", {
      attendanceId: user,
      text: "Contato alice@example.invalid",
    }),
  );
  const agenda = {
    title: "Visita",
    kind: "visita",
    agency: "cordial",
    start: "2026-11-02T10:00:00-03:00",
    end: "2026-11-02T11:00:00-03:00",
  };
  assert.equal(
    await externalRequestHash("prepare_agenda_event", agenda),
    await externalRequestHash("prepare_agenda_event", {
      ...agenda,
      start: "2026-11-02T13:00:00Z",
      end: "2026-11-02T14:00:00Z",
    }),
  );
});
test("canonical confirmation links contain only the proposal UUID and refuse unconfigured or unsafe origins", () => {
  assert.equal(
    externalConfirmationUrl(id, "https://gestao.example/"),
    `https://gestao.example/assistente?action=${id}`,
  );
  for (const origin of [
    "http://gestao.example",
    "https://user:secret@gestao.example",
    "https://gestao.example/path",
    "https://gestao.example/?token=secret",
    "",
  ])
    assert.throws(() => externalConfirmationUrl(id, origin), /configurado/);
});
test("unapproved, wrong-user and disabled bots fail before any business read or privileged write", async () => {
  const { ctx, state } = fixture();
  let writes = 0;
  const deps = {
    origin: "https://gestao.example",
    persist: async () => {
      writes++;
      return id;
    },
  };
  const input = { requestId: request, payload: { attendanceId: user, text: "Draft" } };
  state.approved = false;
  await assert.rejects(
    () => prepareExternalAction(ctx, identity, "prepare_message_draft", input, deps),
    /administrador/,
  );
  state.approved = true;
  state.available = false;
  await assert.rejects(
    () => prepareExternalAction(ctx, identity, "prepare_message_draft", input, deps),
    /disponível/,
  );
  await assert.rejects(
    () =>
      prepareExternalAction(ctx, { ...identity, userId: id }, "prepare_message_draft", input, deps),
    /Sessão/,
  );
  assert.equal(state.businessReads, 0);
  assert.equal(writes, 0);
});
test("repeated expired requests reuse their action and expiry without re-reading/enriching business records", async () => {
  const { ctx, state } = fixture();
  const payload = { attendanceId: user, text: "Draft" };
  const hash = await externalRequestHash("prepare_message_draft", payload);
  const row = {
    id,
    user_id: user,
    scope_key: "corretor:cordial",
    type: "message_draft",
    bot_id: "lead",
    payload,
    expected_state: {},
    revision: 1,
    status: "pending",
    expires_at: "2025-01-01T00:00:00Z",
    origin_client_id: client,
    origin_client_revision: 1,
    external_request_id: request,
    external_request_hash: hash,
  };
  state.rows.push(row);
  let guarded = 0;
  const result = await prepareExternalAction(
    ctx,
    identity,
    "prepare_message_draft",
    { requestId: request, payload },
    {
      origin: "https://gestao.example",
      persist: async (permission, key, h, existing) => {
        assert.equal(permission.revision, 1);
        assert.equal(key, request);
        assert.equal(h, hash);
        assert.equal(existing.id, id);
        guarded++;
        return id;
      },
    },
  );
  assert.equal(result.action.id, id);
  assert.equal(result.action.expiresAt, row.expires_at);
  assert.equal(result.expired, true);
  assert.equal(guarded, 1);
  assert.equal(state.businessReads, 0);
  await assert.rejects(
    () =>
      prepareExternalAction(
        ctx,
        identity,
        "prepare_message_draft",
        { requestId: request, payload: { ...payload, text: "Different" } },
        { origin: "https://gestao.example" },
      ),
    /outros dados/,
  );
  state.revision = 2;
  await assert.rejects(
    () =>
      prepareExternalAction(
        ctx,
        identity,
        "prepare_message_draft",
        { requestId: request, payload },
        { origin: "https://gestao.example" },
      ),
    /anterior/,
  );
});
test("external status is caller-scoped and source-client-scoped, never a global action lookup", async () => {
  const { ctx, state } = fixture();
  state.rows.push({
    id,
    user_id: user,
    scope_key: "corretor:cordial",
    type: "message_draft",
    bot_id: "lead",
    payload: { attendanceId: user, text: "an@example.invalid" },
    expected_state: {},
    revision: 1,
    status: "pending",
    expires_at: "2026-12-01T10:00:00Z",
    origin_client_id: "OTHER",
    origin_client_revision: 1,
  });
  await assert.rejects(
    () => getExternalActionStatus(ctx, identity, id, "https://gestao.example"),
    /deste aplicativo/,
  );
  assert(state.filters.some(([k, v]) => k === "origin_client_id" && v === client));
  assert(state.filters.some(([k, v]) => k === "user_id" && v === user));
  state.rows[0].origin_client_id = client;
  const result = await getExternalActionStatus(ctx, identity, id, "https://gestao.example");
  assert(!JSON.stringify(result).includes("an@example.invalid"));
  assert(!JSON.stringify(result).includes("origin_client"));
});

test("new external preparation uses the mapped bot and caller reads, masks stored payload and retains the pre-enrichment hash", async () => {
  const { ctx, state } = fixture();
  ctx.agentBotId = "time";
  const payload = { attendanceId: user, text: "Contato fixture@example.invalid" };
  let stored: any;
  const result = await prepareExternalAction(
    ctx,
    identity,
    "prepare_attendance_note",
    { requestId: request, payload },
    {
      origin: "https://gestao.example",
      persist: async (permission, key, hash, row) => {
        assert.equal(permission.clientId, client);
        assert.equal(key, request);
        assert.equal(hash, await externalRequestHash("prepare_attendance_note", payload));
        assert.equal(row.bot_id, "lead");
        assert.equal(row.user_id, user);
        assert.equal(row.status, "pending");
        assert(!JSON.stringify(row.payload).includes("fixture@example.invalid"));
        assert.equal(row.expected_state.pipelineStage, "primeiro_contato");
        stored = {
          ...row,
          origin_client_id: client,
          origin_client_revision: 1,
          external_request_id: key,
          external_request_hash: hash,
        };
        state.rows.push(stored);
        return row.id;
      },
    },
  );
  assert.equal(state.businessReads, 1);
  assert.equal(result.action.id, stored.id);
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.confirmationUrl, `https://gestao.example/assistente?action=${stored.id}`);
  assert(!JSON.stringify(result).includes("external_request_hash"));
});
