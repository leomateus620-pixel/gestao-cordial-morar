import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({ reads: [] as Array<{ field: string; value: unknown }> }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (value: unknown) => value;
    const b = {
      middleware: () => b,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { context: unknown; data: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      state.reads.push({ field: "table", value: "meta_ad_drafts" });
      const b = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (field: string, value: unknown) => {
          state.reads.push({ field, value });
          return b;
        },
        in: (field: string, value: unknown) => {
          state.reads.push({ field, value });
          return b;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [], error: null })),
      };
      return b;
    },
  },
}));
import { listMetaAdDrafts } from "./drafts.functions";
function context(granted: boolean, reviewer = false) {
  return {
    userId: "actor",
    supabase: {
      rpc: async (
        name: string,
        args: { _role?: string; p_action?: string; p_agency?: string },
      ) => ({
        error: null,
        data:
          name === "has_role"
            ? args._role === "secretaria" ||
              (reviewer && ["meta_reviewer", "admin"].includes(args._role ?? ""))
            : args.p_action === "read_ad_budget"
              ? granted && (!args.p_agency || args.p_agency === "cordial")
              : args.p_action === "create_draft" && (!args.p_agency || args.p_agency === "cordial"),
      }),
    } as unknown as SupabaseClient,
  };
}
const list = listMetaAdDrafts as unknown as (args: {
  context: ReturnType<typeof context>;
  data: { imobiliaria?: string };
}) => Promise<unknown>;
beforeEach(() => {
  state.reads = [];
});
describe("draft server grants", () => {
  it("denies ordinary secretary and mixed reviewer before administrative table reads", async () => {
    for (const ctx of [context(false), context(true, true)])
      await expect(list({ context: ctx, data: {} })).rejects.toMatchObject({
        code: "no_permission",
      });
    expect(state.reads).toEqual([]);
  });
  it("constrains an unfiltered list to current explicitly budget-authorized agencies", async () => {
    await expect(list({ context: context(true), data: {} })).resolves.toEqual([]);
    expect(state.reads).toContainEqual({ field: "imobiliaria", value: ["cordial"] });
  });
  it("rejects a forged agency even when another agency grant exists", async () => {
    await expect(
      list({ context: context(true), data: { imobiliaria: "morar" } }),
    ).rejects.toMatchObject({ code: "no_permission" });
    expect(state.reads).toEqual([]);
  });
});
