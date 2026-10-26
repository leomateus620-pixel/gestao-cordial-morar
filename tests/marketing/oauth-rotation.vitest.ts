import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ saved: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (definition: unknown) => definition,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => "nonce",
  deleteCookie: vi.fn(),
}));
vi.mock("@/lib/ads/oauth.server", () => ({
  verifyState: async () => ({ u: "actor", p: "meta", i: "cordial", n: "nonce" }),
  exchangeCode: async () => ({ accessToken: "new-token", expiresAt: "2027-01-01T00:00:00Z" }),
}));
vi.mock("@/lib/ads/credentials.server", () => ({
  encryptCredential: (value: string) => `encrypted:${value}`,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: true, error: null }),
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: {
            id: "connection",
            credential_mode: "oauth",
            encrypted_refresh_token: "preserved-refresh",
            capabilities: { token_valid: false, ads_readable: true },
          },
          error: null,
        }),
        update: (value: Record<string, unknown>) => {
          state.saved = value;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
      };
      return builder;
    },
  },
}));
import { Route } from "../../src/routes/api/public/ads-oauth.callback";
describe("OAuth credential rotation", () => {
  it("invalidates proofs from the prior token while preserving its protected refresh credential", async () => {
    const route = Route as unknown as {
      server: { handlers: { GET: (input: { request: Request }) => Promise<Response> } };
    };
    const response = await route.server.handlers.GET({
      request: new Request(
        "https://gestao.example/api/public/ads-oauth/callback?code=code&state=signed",
      ),
    });
    expect(response.status).toBe(302);
    expect(state.saved).toMatchObject({
      encrypted_access_token: "encrypted:new-token",
      encrypted_refresh_token: "preserved-refresh",
      capabilities: {},
      last_diagnosed_at: null,
    });
    expect(state.saved).not.toHaveProperty("access_token", "new-token");
  });
});
