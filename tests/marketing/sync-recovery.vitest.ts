import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  due: [] as Array<Record<string, unknown>>,
  queued: [] as Array<Record<string, unknown>>,
  failed: [] as string[],
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "ad_sync_enqueue") state.queued.push(args);
      return { data: name === "ad_sync_claim" ? [] : "job", error: null };
    },
    from: () => {
      let update = false;
      const builder = {
        select: () => builder,
        in: () => builder,
        eq: (_key: string, id: string) => {
          if (update) state.failed.push(id);
          return builder;
        },
        lte: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        update: () => {
          update = true;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: update ? null : state.due, error: null })),
      };
      return builder;
    },
  },
}));
import { runAdsSyncWorker } from "../../src/lib/ads/sync.server";
const campaign = (
  id: string,
  start = "2026-01-01",
  timezone: string | null = "America/Sao_Paulo",
) => ({
  id,
  user_id: "actor",
  data_inicio: start,
  data_fim: "2027-12-31",
  ad_accounts: { timezone },
});
beforeEach(() => {
  state.due = [];
  state.queued = [];
  state.failed = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
describe("Incremental sync recovery", () => {
  it("skips a future campaign and refreshes another eligible campaign", async () => {
    state.due = [campaign("future", "2027-01-01"), campaign("ready")];
    await runAdsSyncWorker();
    expect(state.queued).toEqual([
      {
        p_campaign_id: "ready",
        p_requested_by: "actor",
        p_range_start: "2026-09-29",
        p_range_end: "2026-10-26",
      },
    ]);
  });
  it("makes invalid account metadata visible without starving other campaigns", async () => {
    state.due = [
      campaign("invalid", "2026-01-01", "Invalid/Timezone"),
      campaign("missing", "2026-01-01", null),
      campaign("ready"),
    ];
    await runAdsSyncWorker();
    expect(state.failed).toEqual(["invalid", "missing"]);
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0].p_campaign_id).toBe("ready");
  });
});
