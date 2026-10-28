import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  saved: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data:
            table === "ad_platform_connections"
              ? state.row
              : table === "app_settings"
                ? { value: "https://gestao.example" }
                : null,
          error: null,
        }),
        update: (value: Record<string, unknown>) => {
          state.saved = value;
          Object.assign(state.row, value);
          return builder;
        },
        upsert: async () => ({ error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: null, error: null })),
      };
      return builder;
    },
  },
}));
import { resetMetaGraphTransportState } from "../../src/lib/ads/meta.graph.server";
import { diagnoseConnection } from "../../src/lib/ads/diagnostics.server";
import { resolveConnectionCredential } from "../../src/lib/ads/credentials.server";
function provider(
  debug: unknown,
  options: { debugStatus?: number; denyAds?: boolean; networkFailure?: boolean } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL) => {
      if (input.pathname.endsWith("/debug_token")) {
        if (options.networkFailure) throw new Error("transport-secret");
        return new Response(JSON.stringify(debug), { status: options.debugStatus ?? 200 });
      }
      if (input.pathname.endsWith("/act_100"))
        return new Response(
          JSON.stringify(
            options.denyAds
              ? { error: { code: 200 } }
              : {
                  account_id: "100",
                  name: "Account",
                  currency: "BRL",
                  timezone_name: "America/Sao_Paulo",
                },
          ),
          { status: options.denyAds ? 403 : 200 },
        );
      return new Response(JSON.stringify({ data: [] }));
    }),
  );
}
beforeEach(() => {
  state.row = {
    id: "connection",
    platform: "meta",
    imobiliaria: "cordial",
    credential_mode: "system_user",
    credential_ref: "META_CORDIAL_ACCESS_TOKEN",
    external_account_id: "100",
    app_id: "200",
    page_id: null,
    expires_at: "2020-01-01T00:00:00Z",
    capabilities: { token_valid: false },
  };
  state.saved = {};
  vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "old-token");
  vi.stubEnv("META_APP_ID", "200");
  vi.stubEnv("META_APP_SECRET", "test-secret");
});
afterEach(() => {
  resetMetaGraphTransportState();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Live credential diagnostics", () => {
  it("reports an expired credential as present and known invalid, then revalidates its rotation", async () => {
    provider({ error: { code: 190 } }, { debugStatus: 400 });
    const expired = await diagnoseConnection("connection");
    expect(expired.credential_present).toBe(true);
    expect(expired.token_valid).toBe(false);
    expect(expired.ads_readable).toBe(false);
    expect(state.row.expires_at).toBe("2020-01-01T00:00:00Z");
    await expect(resolveConnectionCredential("connection")).rejects.toMatchObject({
      code: "token_expired",
    });
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "rotated-token");
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    provider({
      data: { is_valid: true, app_id: "200", expires_at: expiration, scopes: ["ads_read"] },
    });
    const rotated = await diagnoseConnection("connection");
    expect(rotated.credential_present).toBe(true);
    expect(rotated.token_valid).toBe(true);
    expect(rotated.ads_readable).toBe(true);
    expect(state.row.expires_at).toBe(new Date(expiration * 1000).toISOString());
    expect((await resolveConnectionCredential("connection")).token).toBe("rotated-token");
  });
  it("does not preserve a cached green capability when the provider denies permission", async () => {
    state.row.capabilities = { token_valid: true, ads_readable: true };
    provider({ data: { is_valid: true, app_id: "200" } }, { denyAds: true });
    const caps = await diagnoseConnection("connection");
    expect(caps.token_valid).toBe(true);
    expect(caps.ads_readable).toBe(false);
    expect(state.saved.status).toBe("error");
  });
  it("distinguishes unknown validity during transport failure from a missing credential", async () => {
    provider({}, { networkFailure: true });
    const caps = await diagnoseConnection("connection");
    expect(caps.credential_present).toBe(true);
    expect(caps.token_valid).toBeNull();
    expect(state.row.expires_at).toBe("2020-01-01T00:00:00Z");
    expect(state.saved).not.toHaveProperty("expires_at");
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "");
    const missing = await diagnoseConnection("connection");
    expect(missing.credential_present).toBe(false);
    expect(missing.token_valid).toBeNull();
  });
});
