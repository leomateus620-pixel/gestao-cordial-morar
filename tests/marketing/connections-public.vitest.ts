import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { listAdConnections, type AdConnectionPublic } from "../../src/lib/ads/ads.functions";
const handler = listAdConnections as unknown as (input: {
  context: { userId: string; supabase: SupabaseClient };
}) => Promise<AdConnectionPublic[]>;
function context(roles: string[]) {
  const rpc = vi.fn(async (name: string, args?: { _role: string }) => ({
    error: null,
    data:
      name === "has_role"
        ? roles.includes(args?._role ?? "")
        : [
            {
              id: "business-connection",
              imobiliaria: "cordial",
              platform: "meta",
              credential_mode: "system_user",
              status: "connected",
              external_account_id: "100",
              page_id: "200",
              app_id: "300",
              account_label: "Cordial",
              capabilities: null,
              expires_at: null,
              last_error: null,
            },
          ],
  }));
  return { rpc, value: { userId: "actor", supabase: { rpc } as unknown as SupabaseClient } };
}
afterEach(() => {
  vi.unstubAllEnvs();
});
describe("Connection metadata visibility", () => {
  it("returns no private connection metadata or synthetic disconnected placeholders to a secretary", async () => {
    vi.stubEnv("META_APP_ID", "300");
    vi.stubEnv("META_APP_SECRET", "dummy");
    const ctx = context(["secretaria"]);
    expect(await handler({ context: ctx.value })).toEqual([]);
    expect(ctx.rpc.mock.calls.some(([name]) => name === "ad_connections_public")).toBe(false);
  });
  it("preserves sanitized business metadata for the administrator", async () => {
    const ctx = context(["admin"]);
    const rows = await handler({ context: ctx.value });
    expect(rows.find((row) => row.id === "business-connection")).toMatchObject({
      imobiliaria: "cordial",
      status: "connected",
      accountId: "100",
      pageId: "200",
      appId: "300",
    });
    expect(ctx.rpc.mock.calls.some(([name]) => name === "ad_connections_public")).toBe(true);
  });
});
