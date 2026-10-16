import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectAssistantBriefing,
  readAssistantRecord,
  rehydrateAssistantHistory,
} from "./read-model.server";
import { agentTools } from "./tools";
import type { AgentContext } from "./security";
import { ASSISTANT_HISTORY_TEXT, assistantReferenceParams, assistantScopeKey } from "./scope";
import type { AssistantMessage } from "./stream";
const ctx: AgentContext = {
  userId: "10000000-0000-4000-8000-000000000001",
  roles: ["corretor"],
  agencies: ["cordial"],
  supabase: {} as any,
};
test("reopening prepares rereads an owned action and never prepares or executes again", async () => {
  let reads = 0;
  const messages: AssistantMessage[] = [
    {
      id: "m",
      role: "assistant",
      bot_id: "agenda",
      content: "old",
      created_at: "2026-10-16T08:00:00Z",
      results: [
        { tool: "prepare_agenda_event", data: { params: { actionId: ctx.userId } } },
        { tool: "prepare_routine", data: { params: {} } },
      ],
    },
  ];
  const out = await rehydrateAssistantHistory(messages, ctx, {
    execute: async () => {
      throw new Error("preparation must never be replayed");
    },
    readAction: async (current, id) => {
      assert.equal(current, ctx);
      assert.equal(id, ctx.userId);
      reads++;
      return { id, status: "executed" };
    },
    audit: async () => {},
  });
  assert.equal(reads, 1);
  assert.equal(out[0].results[0].data.action.status, "executed");
  assert.equal(out[0].results[1].data.status, "refresh_required");
});
test("briefing uses the real closed schema of each allowed tool and retains role gates", async () => {
  const executed: string[] = [],
    audits: string[] = [];
  const items = await collectAssistantBriefing(
    ctx,
    ["agenda_today", "stale_attendances", "expiring_agenciamentos"],
    {
      execute: async (name, input, context) => {
        assert.equal(context, ctx);
        agentTools.find((tool) => tool.name === name)!.inputSchema.parse(input);
        executed.push(name);
        return { content: [], structuredContent: { total: 0 } };
      },
      audit: async (name) => {
        audits.push(name);
      },
    },
  );
  assert.deepEqual(executed, ["agenda_today", "stale_attendances", "expiring_agenciamentos"]);
  assert.equal(items.length, 3);
  assert(!executed.includes("rentals_overdue"));
  assert.deepEqual(audits, executed);
});
test("briefing reports failed query or failed audit as unavailable without sensitive errors", async () => {
  const items = await collectAssistantBriefing(ctx, ["agenda_today"], {
    execute: async () => {
      throw new Error("SQL with personal data fixture@example.invalid");
    },
    audit: async () => {},
  });
  assert.equal(items[0].data.status, "unavailable");
  assert(!JSON.stringify(items).includes("fixture@example.invalid"));
});
test("context lookup validates record kind/id before calling the reader and audits the actual result", async () => {
  let count = 0;
  const audit: unknown[][] = [];
  const deps = {
    execute: async (name: string, _input: unknown, context: AgentContext) => {
      count++;
      assert.equal(context, ctx);
      assert.equal(name, "get_record_context");
      return {
        content: [],
        structuredContent: {
          record: { email: "fixture@example.invalid", href: "/clientes?clientId=fixture" },
        },
      };
    },
    audit: async (...args: unknown[]) => {
      audit.push(args);
    },
  };
  await assert.rejects(() => readAssistantRecord({ kind: "table", id: ctx.userId }, ctx, deps));
  await assert.rejects(() =>
    readAssistantRecord({ kind: "client", id: "SQL", roles: ["admin"] }, ctx, deps),
  );
  assert.equal(count, 0);
  const result = await readAssistantRecord({ kind: "client", id: ctx.userId }, ctx, deps);
  assert.equal(count, 1);
  assert(!result.record.email.includes("fixture@example.invalid"));
  assert.equal(audit[0][0], "get_record_context");
});
test("reassigned client is re-read through current scope and old business data/prose is never replayed", async () => {
  const rows: AssistantMessage[] = [
    {
      id: "message",
      bot_id: "agenda",
      role: "assistant",
      content: ASSISTANT_HISTORY_TEXT,
      results: [
        { tool: "get_record_context", data: { params: { kind: "client", id: ctx.userId } } },
      ],
      created_at: "2026-10-16T10:00:00Z",
    },
  ];
  let currentOwner = ctx.userId;
  const deps = {
    execute: async (_tool: string, params: any, current: AgentContext) => {
      assert.equal(params.id, ctx.userId);
      return {
        content: [],
        structuredContent: {
          record: currentOwner === current.userId ? { nome: "Cliente fixture" } : null,
        },
      };
    },
    audit: async () => {},
  };
  assert.equal(
    (await rehydrateAssistantHistory(rows, ctx, deps))[0].results[0].data.record.nome,
    "Cliente fixture",
  );
  currentOwner = "outro-corretor";
  const refreshed = await rehydrateAssistantHistory(rows, ctx, deps);
  assert.equal(refreshed[0].results[0].data.record, null);
  assert(!JSON.stringify(refreshed).includes("Cliente fixture"));
  assert(
    !JSON.stringify(rows).includes("Cliente fixture"),
    "the immutable stored ref never contains the business payload",
  );
});
test("history refresh is bounded to eight recent references and handles revoked tool access", async () => {
  const row: AssistantMessage = {
    id: "message",
    bot_id: "agenda",
    role: "assistant",
    content: ASSISTANT_HISTORY_TEXT,
    created_at: "2026-10-16T10:00:00Z",
    results: Array.from({ length: 12 }, () => ({ tool: "agenda_today", data: { params: {} } })),
  };
  let count = 0;
  const output = await rehydrateAssistantHistory([row], ctx, {
    execute: async () => {
      count++;
      throw new Error("Sem acesso atual");
    },
    audit: async () => {},
  });
  assert.equal(count, 8);
  assert.equal(output[0].results[0].data.status, "unavailable");
  assert.equal(output[0].results[11].data.status, "refresh_required");
});
test("immutable scope is deterministic; refs never retain free text, names or owner fields", () => {
  assert.equal(
    assistantScopeKey({
      ...ctx,
      roles: ["corretor", "admin"],
      agencies: ["morar", "cordial", "cordial"],
    }),
    "admin:cordial,morar",
  );
  assert.deepEqual(
    assistantReferenceParams({
      name: "Pessoa",
      query: "nome proprietário",
      proprietario_nome: "Pessoa",
      cidade: "nome estranho",
      limit: 5,
      date: "2026-10-16",
      clientId: ctx.userId,
      kind: "client",
    }),
    { limit: 5, date: "2026-10-16", clientId: ctx.userId, kind: "client" },
  );
});
test("history generic context references remain within the conversation bot's modules", async () => {
  let queries = 0;
  for (const [botId, kind] of [
    ["agenda", "rental"],
    ["lead", "property"],
  ]) {
    const rows: AssistantMessage[] = [
      {
        id: "message",
        bot_id: botId,
        role: "assistant",
        content: ASSISTANT_HISTORY_TEXT,
        created_at: "2026-10-16T10:00:00Z",
        results: [{ tool: "get_record_context", data: { params: { kind, id: ctx.userId } } }],
      },
    ];
    const output = await rehydrateAssistantHistory(rows, ctx, {
      execute: async () => {
        queries++;
        return { content: [], structuredContent: { record: { id: "out-of-bot-scope" } } };
      },
      audit: async () => {},
    });
    assert.equal(output[0].results[0].data.status, "unavailable");
  }
  assert.equal(queries, 0);
});

test("disabled bots preserve stored history without refreshing business data", async () => {
  const { getAgentBot } = await import("./bots");
  let queries = 0;
  const rows: AssistantMessage[] = [
    {
      id: "disabled",
      role: "assistant",
      bot_id: "agenda",
      content: "old",
      created_at: "2026-10-16T10:00:00Z",
      results: [{ tool: "agenda_today", data: { params: {} } }],
    },
  ];
  const result = await rehydrateAssistantHistory(rows, ctx, {
    resolveBot: async () => ({ ...getAgentBot("agenda")!, active: false }),
    execute: async () => {
      queries++;
      throw new Error("must not query");
    },
    audit: async () => {},
  });
  assert.equal(queries, 0);
  assert.equal(result[0].results[0].data.status, "unavailable");
  assert.equal(rows[0].content, "old");
});
