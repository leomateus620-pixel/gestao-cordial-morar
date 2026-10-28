import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({
  reads: [] as Array<{ table: string; field: string; value: unknown }>,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { context: unknown; data: unknown }) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      state.reads.push({ table, field: "from", value: null });
      const filters: Array<{ field: string; values: unknown[] }> = [];
      const result = () => {
        const connections = [
          { id: "cordial-1", platform: "meta", imobiliaria: "cordial", external_account_id: "1" },
          { id: "morar-1", platform: "meta", imobiliaria: "morar", external_account_id: "1" },
          { id: "cordial-9", platform: "meta", imobiliaria: "cordial", external_account_id: "9" },
        ];
        const records =
          table === "ad_platform_connections"
            ? connections
            : connections.map((c) => ({
                id: c.id,
                connection_id: c.id,
                imobiliaria: c.imobiliaria,
                privacy_deleted_at: null,
                last_error: null,
              }));
        const data = records.filter((row) =>
          filters.every((f) => f.values.includes((row as Record<string, unknown>)[f.field])),
        );
        return { data, count: data.length, error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (field: string, value: unknown) => {
          filters.push({ field, values: [value] });
          state.reads.push({ table, field, value });
          return builder;
        },
        is: (field: string, value: unknown) => {
          filters.push({ field, values: [value] });
          return builder;
        },
        in: (field: string, values: unknown[]) => {
          filters.push({ field, values });
          state.reads.push({ table, field, value: values });
          return builder;
        },
        range: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result())),
      };
      return builder;
    },
  },
}));
import { listMetaLeads } from "./leads.functions";
const context = (roles: string[]) => ({
  userId: "actor",
  supabase: {
    rpc: async (name: string, args: { _role?: string; p_agency?: string }) => ({
      data: name === "has_role" ? roles.includes(args._role ?? "") : args.p_agency === "cordial",
      error: null,
    }),
  } as unknown as SupabaseClient,
});
const run = listMetaLeads as unknown as (args: {
  context: ReturnType<typeof context>;
  data: Record<string, unknown>;
}) => Promise<{ items: Array<{ id: string }>; total: number }>;
beforeEach(() => {
  state.reads = [];
});
describe("lead server boundary — synthetic records", () => {
  it("denies reviewer with combined admin before any privileged read", async () => {
    await expect(
      run({ context: context(["admin", "meta_reviewer"]), data: { imobiliaria: "cordial" } }),
    ).rejects.toMatchObject({ code: "no_permission" });
    expect(state.reads).toEqual([]);
  });
  it("resolves account connections only within the selected authorized agency", async () => {
    const rows = await run({
      context: context(["secretaria"]),
      data: { imobiliaria: "cordial", accountId: "1" },
    });
    expect(rows.items.map((r) => r.id)).toEqual(["cordial-1"]);
    expect(state.reads).toContainEqual({
      table: "meta_lead_submissions",
      field: "connection_id",
      value: ["cordial-1"],
    });
  });
  it("does not query contacts for an inaccessible account or agency", async () => {
    expect(
      await run({
        context: context(["secretaria"]),
        data: { imobiliaria: "cordial", accountId: "99" },
      }),
    ).toEqual({ items: [], total: 0 });
    expect(state.reads.some((r) => r.table === "meta_lead_submissions")).toBe(false);
    state.reads = [];
    await expect(
      run({ context: context(["secretaria"]), data: { imobiliaria: "morar", accountId: "1" } }),
    ).rejects.toMatchObject({ code: "no_permission" });
    expect(state.reads).toEqual([]);
  });
});
