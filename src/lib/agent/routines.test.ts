import test from "node:test";
import assert from "node:assert/strict";
import { proposeRoutine, nextRoutineRun, routineProposal } from "./routines.schemas";
import { memoryPreferences } from "./memory.schemas";
test("daily default is 08h Brasília, includes weekends and never performs a write", () => {
  const out = proposeRoutine("Me mostre meu dia");
  assert.equal(out.proposal.hour, 8);
  assert.equal(out.proposal.days, "every_day");
  assert.equal(nextRoutineRun(8, 0, new Date("2026-10-16T11:00:01Z")), "2026-10-17T11:00:00.000Z");
  assert.equal(nextRoutineRun(8, 0, new Date("2026-10-16T10:59:59Z")), "2026-10-16T11:00:00.000Z");
});
test("weekdays skip the weekend and weekly retains its declared weekday", () => {
  assert.equal(proposeRoutine("Dias úteis às 8h resuma a agenda").proposal.days, "weekdays");
  const out = proposeRoutine("Toda segunda às 9h resuma a equipe");
  assert.equal(out.proposal.days, "weekly");
  assert.equal(out.proposal.dayOfWeek, 1);
  assert.equal(
    nextRoutineRun(8, 0, new Date("2026-10-16T12:00:00Z"), "weekdays"),
    "2026-10-19T11:00:00.000Z",
  );
  assert.equal(
    nextRoutineRun(9, 0, new Date("2026-10-19T13:00:00Z"), "weekly", 1),
    "2026-10-26T12:00:00.000Z",
  );
});
test("routine proposals reject business mutations, unsupported time and arbitrary payload keys", () => {
  for (const text of [
    "Enviar mensagem ao cliente no whatsapp",
    "emitir NFS-e às 8h",
    "publicar imóvel todo dia",
    "todo dia resuma as visitas de amanhã",
  ])
    assert.throws(() => proposeRoutine(text));
  assert.throws(() =>
    routineProposal.parse({ name: "Teste", template: "daily_briefing", hour: 99 }),
  );
  assert.throws(() =>
    routineProposal.parse({ name: "Teste", template: "daily_briefing", sql: "SELECT private" }),
  );
});
test("memory accepts only structured personal preferences and rejects owner/contact payloads", () => {
  assert.equal(memoryPreferences.parse({}).tone, "curto");
  for (const invalid of [
    { owner: "Ana" },
    { notes: "Pessoa proprietária" },
    { focusNeighborhoods: ["ana@example.com"] },
    { focusNeighborhoods: ["123.456.789-09"] },
    { preferredStart: "18:00", preferredEnd: "08:00" },
  ])
    assert.throws(() => memoryPreferences.parse(invalid));
  assert.deepEqual(
    memoryPreferences.parse({ tone: "formal", focusNeighborhoods: ["Centro"] }).focusNeighborhoods,
    ["Centro"],
  );
});

import { assertRoutineTemplate } from "./routines.server";
test("routine template role matrix applies to brokers of both agencies", () => {
  for (const agency of ["cordial", "morar"])
    for (const role of ["admin", "secretaria", "corretor", "financeiro"]) {
      const ctx = {
        userId: "00000000-0000-4000-8000-000000000001",
        roles: [role],
        agencies: [agency],
        supabase: {} as any,
      };
      for (const template of [
        "daily_briefing",
        "agenda_today",
        "stale_attendances",
        "expiring_agenciamentos",
        "rentals_overdue",
        "new_matches",
        "broker_ranking",
        "market_digest",
      ]) {
        const permitted =
          role !== "financeiro" &&
          (!["broker_ranking", "market_digest"].includes(template) || role === "admin") &&
          (template !== "rentals_overdue" || role !== "corretor");
        if (permitted) assert.doesNotThrow(() => assertRoutineTemplate(template, ctx));
        else assert.throws(() => assertRoutineTemplate(template, ctx));
      }
    }
});

test("opening an old briefing does not query a disabled colleague's results", async () => {
  const { readRoutineRun } = await import("./routines.server");
  const { assistantScopeKey } = await import("./scope");
  const { agentBots } = await import("./bots");
  const queried: string[] = [];
  const current: any = {
    userId: "00000000-0000-4000-8000-000000000001",
    roles: ["corretor"],
    agencies: ["cordial"],
  };
  const run = {
    id: "run",
    status: "completed",
    scope_key: assistantScopeKey(current),
    result_refs: [{ tool: "stale_attendances", params: {}, template: "daily_briefing" }],
  };
  current.supabase = {
    from(table: string) {
      queried.push(table);
      if (!["assistant_routine_runs", "assistant_bot_configs"].includes(table))
        throw new Error("business queries must stay blocked");
      const result = {
        data:
          table === "assistant_bot_configs"
            ? agentBots
                .filter((bot) => bot.roles.includes("corretor"))
                .map((bot) => ({
                  bot_id: bot.id,
                  enabled: bot.id !== "lead",
                  instructions: "",
                  suggestions: null,
                  revision: 1,
                  updated_at: null,
                }))
            : run,
        error: null,
      };
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => result,
        then(resolve: any) {
          return Promise.resolve(result).then(resolve);
        },
      };
    },
  };
  const result = await readRoutineRun("run", current);
  assert.equal(result.items[0].data.status, "unavailable");
  assert.deepEqual(queried, ["assistant_routine_runs", "assistant_bot_configs"]);
});
