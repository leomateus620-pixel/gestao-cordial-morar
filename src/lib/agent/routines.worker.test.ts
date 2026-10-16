import test from "node:test";
import assert from "node:assert/strict";
import { runAssistantRoutines } from "./routines.worker.server";
import type { AgentContext } from "./security";

test(
  "batch starts twenty jobs together, rotates each user once and keeps caller contexts isolated",
  { timeout: 3000 },
  async () => {
    const old = process.env.ASSISTANT_ROUTINES_ENABLED;
    process.env.ASSISTANT_ROUTINES_ENABLED = "true";
    try {
      const runs = Array.from({ length: 20 }, (_, i) => ({
        id: `run-${i}`,
        user_id: `user-${i % 2}`,
        routine_id: `routine-${i}`,
        routine_revision: 1,
        attempts: 1,
        lease_id: `lease-${i}`,
      }));
      const rotations: string[] = [],
        finished: any[] = [];
      let started = 0,
        release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const admin = {
        rpc: async (name: string, args: any) => {
          if (name === "assistant_routine_claim") {
            assert.equal(args.p_limit, 20);
            return { data: runs };
          }
          assert.equal(name, "assistant_routine_finish");
          finished.push(args);
          return { data: true };
        },
        from: () => {
          throw new Error("successful jobs must not enter failure handling");
        },
      };
      const shared: AgentContext[] = [];
      const result = await runAssistantRoutines(999, {
        admin,
        assertBotEnabled: async () => {},
        contextForUser: async (userId) => {
          rotations.push(userId);
          const context = {
            userId,
            roles: ["corretor"],
            agencies: [userId === "user-0" ? "cordial" : "morar"],
            supabase: {
              from: () => ({
                select() {
                  return this;
                },
                eq() {
                  return this;
                },
                maybeSingle: async () => ({
                  data: {
                    status: "active",
                    revision: 1,
                    template: "agenda_today",
                    hour: 8,
                    minute: 0,
                    days: "every_day",
                  },
                }),
              }),
            } as any,
          };
          shared.push(context);
          return context;
        },
        executeTemplate: async (_template, ctx) => {
          assert.equal(ctx.agencies[0], ctx.userId === "user-0" ? "cordial" : "morar");
          assert.ok(ctx.signal);
          started++;
          if (started === 20) release();
          await barrier;
          return { refs: [], seen: [], nextCursor: null };
        },
      });
      assert.equal(result.completed, 20);
      assert.equal(finished.length, 20);
      assert.deepEqual(rotations.sort(), ["user-0", "user-1"]);
      assert.ok(
        shared.every((ctx) => !ctx.signal),
        "per-job deadlines never mutate the shared caller context",
      );
    } finally {
      if (old === undefined) delete process.env.ASSISTANT_ROUTINES_ENABLED;
      else process.env.ASSISTANT_ROUTINES_ENABLED = old;
    }
  },
);

test("provider setup failures do not revoke OAuth and grant contention does not consume attempts", async () => {
  const old = process.env.ASSISTANT_ROUTINES_ENABLED;
  process.env.ASSISTANT_ROUTINES_ENABLED = "true";
  try {
    for (const code of ["research_not_configured", "delegation_busy"]) {
      const writes: Array<{ table: string; values: any }> = [];
      const context: AgentContext = {
        userId: "user",
        roles: ["admin"],
        agencies: ["cordial"],
        supabase: {
          from: () => ({
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({
              data: {
                revision: 1,
                status: "active",
                template: "market_digest",
                hour: 8,
                minute: 0,
                days: "every_day",
              },
            }),
          }),
        } as any,
      };
      const admin = {
        rpc: async (name: string) => {
          assert.equal(name, "assistant_routine_claim");
          return {
            data: [
              {
                id: "run",
                user_id: "user",
                routine_id: "routine",
                routine_revision: 1,
                attempts: 1,
                lease_id: "lease",
              },
            ],
          };
        },
        from: (table: string) => ({
          update(values: any) {
            writes.push({ table, values });
            return this;
          },
          eq() {
            return this;
          },
          then(done: any) {
            return Promise.resolve({ error: null }).then(done);
          },
        }),
      };
      const result = await runAssistantRoutines(1, {
        admin,
        assertBotEnabled: async () => {},
        contextForUser: async () => {
          if (code === "delegation_busy") throw new Error(code);
          return context;
        },
        executeTemplate: async () => {
          throw new Error(code);
        },
      });
      assert.equal(result.needsReauthorization, 0);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].table, "assistant_routine_runs");
      assert.equal(writes[0].values.status, "failed");
      assert.equal(writes[0].values.attempts, code === "delegation_busy" ? 0 : undefined);
    }
  } finally {
    if (old === undefined) delete process.env.ASSISTANT_ROUTINES_ENABLED;
    else process.env.ASSISTANT_ROUTINES_ENABLED = old;
  }
});


test("daily briefing read-only template includes the NFS-e review tool for roles allowed to see it", async () => {
  // Static guard: keeps the daily briefing in sync with the read-only NFS-e
  // review tool (rental_nfse_alerts is role-gated to admin/secretaria by the
  // tool itself and by getAllowedTools, so a corretor never receives it).
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./routines.worker.server.ts", import.meta.url), "utf8");
  const match = source.match(/if \(template === "daily_briefing"\) \{[\s\S]*?for \(const tool of \[([\s\S]*?)\]\)/);
  assert.ok(match, "daily_briefing tool list not found");
  const tools = match![1].split(",").map((t) => t.trim().replace(/"/g, "")).filter(Boolean);
  assert.deepEqual(tools, [
    "agenda_today",
    "stale_attendances",
    "expiring_agenciamentos",
    "rentals_overdue",
    "rental_nfse_alerts",
  ]);
});
