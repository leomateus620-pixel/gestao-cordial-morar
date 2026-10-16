import { test } from "node:test";
import assert from "node:assert/strict";
import { persistAssistantTurn, readOwnedAssistantHistory } from "./persistence.server";
const user = "10000000-0000-4000-8000-000000000001",
  foreign = "10000000-0000-4000-8000-000000000002",
  conversation = "20000000-0000-4000-8000-000000000001";
function callerClient(owner: string, bot = "agenda") {
  const filters: Array<{ table: string; column: string; value: string }> = [];
  return {
    filters,
    client: {
      rpc: async () => ({ data: "corretor:cordial", error: null }),
      from(table: string) {
        const where = new Map<string, string>();
        const result = () =>
          table === "assistant_conversations"
            ? {
                data:
                  where.get("user_id") === owner &&
                  (!where.has("bot_id") || where.get("bot_id") === bot)
                    ? { id: conversation, bot_id: bot }
                    : null,
                error: null,
              }
            : {
                data: [
                  {
                    id: "new",
                    role: "assistant",
                    content: "fixture@example.invalid",
                    results: [],
                    created_at: "2026-10-16T11:00:00Z",
                  },
                  {
                    id: "old",
                    role: "user",
                    content: "Oi",
                    results: [],
                    created_at: "2026-10-16T10:00:00Z",
                  },
                ],
                error: null,
              };
        const chain: any = {
          select() {
            return chain;
          },
          eq(column: string, value: string) {
            where.set(column, value);
            filters.push({ table, column, value });
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle: async () => result(),
          then(resolve: (v: unknown) => unknown) {
            return Promise.resolve(result()).then(resolve);
          },
        };
        return chain;
      },
    } as any,
  };
}
test("history requires explicit current owner even when RLS might grant admin wider reads", async () => {
  const s = callerClient(foreign);
  await assert.rejects(
    () => readOwnedAssistantHistory(s.client, user, conversation),
    /Conversa não encontrada/,
  );
  assert(
    s.filters.some(
      (f) => f.table === "assistant_conversations" && f.column === "user_id" && f.value === user,
    ),
  );
  assert(!s.filters.some((f) => f.table === "assistant_messages"));
});
test("foreign/mismatched conversation is rejected before quota, writer import or gateway", async () => {
  for (const s of [callerClient(foreign), callerClient(user, "match")]) {
    await assert.rejects(
      () =>
        persistAssistantTurn({
          client: s.client,
          userId: user,
          botId: "agenda",
          scopeKey: "corretor:cordial",
          message: "teste",
          conversationId: conversation,
        }),
      /Conversa não encontrada/,
    );
  }
});
test("own history queries have owner and conversation filters, chronological output and contact masking", async () => {
  const s = callerClient(user);
  const rows = await readOwnedAssistantHistory(s.client, user, conversation, "agenda");
  assert.deepEqual(
    rows.map((row) => row.id),
    ["old", "new"],
  );
  assert(!rows[1].content.includes("fixture@example.invalid"));
  assert(
    s.filters.some(
      (f) => f.table === "assistant_messages" && f.column === "user_id" && f.value === user,
    ),
  );
  assert(
    s.filters.some(
      (f) =>
        f.table === "assistant_messages" &&
        f.column === "conversation_id" &&
        f.value === conversation,
    ),
  );
});
