import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({ effects: [] as string[], adminReads: [] as string[] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://cordialgestao.com/"),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/google-calendar/google.server", () => ({
  signState: ({ userId }: { userId: string }) => {
    state.effects.push(`state:${userId}`);
    return "synthetic-state";
  },
  buildAuthUrl: () => "https://accounts.google.com/authorized-synthetic-test",
  revokeToken: async () => {
    state.effects.push("revoke");
  },
  backfillGoogleSyncForUser: async (userId: string) => {
    state.effects.push(`backfill:${userId}`);
    return { ok: true };
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      state.adminReads.push(table);
      let deleting = false;
      const builder = {
        select: () => builder,
        delete: () => {
          deleting = true;
          return builder;
        },
        eq: (_field: string, id: string) => {
          state.adminReads.push(id);
          if (deleting) state.effects.push(`delete:${id}`);
          return builder;
        },
        maybeSingle: async () => ({ data: { refresh_token: "synthetic-token" } }),
      };
      return builder;
    },
  },
}));
import {
  startGoogleOAuth,
  disconnectGoogleCalendar,
  backfillMyGoogleAgenda,
  getMyGoogleConnection,
} from "@/lib/google-calendar/google-calendar.functions";
const context = (roles: string[], override?: { data: unknown; error: unknown }) => ({
  userId: "synthetic-actor",
  supabase: {
    rpc: async (name: string) => {
      expect(name).toBe("is_meta_reviewer");
      return override ?? { data: roles.includes("meta_reviewer"), error: null };
    },
    from: (table: string) => {
      expect(table).toBe("google_calendar_connections");
      const builder = {
        select: () => builder,
        eq: (_field: string, id: string) => {
          expect(id).toBe("synthetic-actor");
          return builder;
        },
        maybeSingle: async () => ({
          data: {
            google_email: "synthetic@example.invalid",
            scope: "https://www.googleapis.com/auth/calendar.events",
            last_error: null,
          },
        }),
      };
      return builder;
    },
  } as unknown as SupabaseClient,
});
const run = (fn: unknown, ctx: ReturnType<typeof context>) =>
  (fn as (args: { context: typeof ctx }) => Promise<unknown>)({ context: ctx });
const commands = [startGoogleOAuth, disconnectGoogleCalendar, backfillMyGoogleAgenda];
beforeEach(() => {
  state.effects = [];
  state.adminReads = [];
});
describe("Google Calendar direct server boundary — synthetic identity", () => {
  it("denies reviewer and combined roles before admin reads or external effects", async () => {
    for (const roles of [
      ["meta_reviewer"],
      ["admin", "meta_reviewer"],
      ["secretaria", "meta_reviewer"],
    ])
      for (const command of commands)
        await expect(run(command, context(roles))).rejects.toThrow("perfil de avaliação");
    expect(state.effects).toEqual([]);
    expect(state.adminReads).toEqual([]);
  });
  it("fails closed when reviewer membership cannot be checked", async () => {
    for (const result of [
      { data: null, error: null },
      { data: false, error: { message: "unavailable" } },
    ])
      for (const command of commands)
        await expect(run(command, context(["admin"], result))).rejects.toThrow();
    expect(state.effects).toEqual([]);
    expect(state.adminReads).toEqual([]);
  });
  it("preserves existing own-account commands for other profiles", async () => {
    for (const roles of [["admin"], ["secretaria"], ["corretor"]]) {
      await expect(run(startGoogleOAuth, context(roles))).resolves.toEqual({
        url: "https://accounts.google.com/authorized-synthetic-test",
      });
      await expect(run(disconnectGoogleCalendar, context(roles))).resolves.toEqual({ ok: true });
      await expect(run(backfillMyGoogleAgenda, context(roles))).resolves.toEqual({ ok: true });
    }
    expect(state.effects.filter((e) => e === "backfill:synthetic-actor")).toHaveLength(3);
    expect(state.effects.filter((e) => e === "delete:synthetic-actor")).toHaveLength(3);
    expect(state.effects.filter((e) => e === "revoke")).toHaveLength(3);
  });
  it("preserves the authorized connection read and its scope diagnosis", async () => {
    await expect(run(getMyGoogleConnection, context(["secretaria"]))).resolves.toMatchObject({
      google_email: "synthetic@example.invalid",
      hasCalendarScope: true,
      last_error: null,
    });
    expect(state.effects).toEqual([]);
    expect(state.adminReads).toEqual([]);
  });
});
