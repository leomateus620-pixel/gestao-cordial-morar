import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
    }),
  },
}));
import {
  resolveConnectionCredential,
  resolvePageCredential,
} from "../../src/lib/ads/credentials.server";
beforeEach(() => {
  state.row = {
    id: "connection",
    platform: "meta",
    imobiliaria: "cordial",
    credential_mode: "system_user",
    credential_ref: "META_CORDIAL_ACCESS_TOKEN",
    external_account_id: "100",
    expires_at: null,
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
});
describe("Connection credential isolation", () => {
  it("reports a missing secret without inventing a connected state", async () => {
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "");
    await expect(resolveConnectionCredential("connection")).rejects.toMatchObject({
      code: "not_configured",
    });
  });
  it("resolves only the explicitly referenced system-user token", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "other-brand-secret");
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "configured-secret");
    const result = await resolveConnectionCredential("connection", {
      platform: "meta",
      imobiliaria: "cordial",
      accountId: "act_100",
    });
    expect(result.token).toBe("configured-secret");
    await expect(
      resolveConnectionCredential("connection", { imobiliaria: "morar" }),
    ).rejects.toMatchObject({ code: "no_permission" });
    await expect(
      resolveConnectionCredential("connection", { accountId: "200" }),
    ).rejects.toMatchObject({ code: "no_permission" });
  });
  it("never refreshes a system-user token as personal OAuth", async () => {
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "configured-secret");
    state.row.expires_at = "2020-01-01T00:00:00Z";
    state.row.refresh_token = "must-not-use";
    await expect(resolveConnectionCredential("connection")).rejects.toMatchObject({
      code: "token_expired",
    });
    expect((await resolveConnectionCredential("connection", { allowExpired: true })).token).toBe(
      "configured-secret",
    );
  });
  it("blocks proven revocation even if Meta did not report an expiration", async () => {
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "configured-secret");
    state.row.expires_at = null;
    state.row.capabilities = { token_valid: false };
    await expect(resolveConnectionCredential("connection")).rejects.toMatchObject({
      code: "token_expired",
    });
    expect((await resolveConnectionCredential("connection", { allowExpired: true })).token).toBe(
      "configured-secret",
    );
  });
  it("keeps Page-token availability independent of an absent Ads token", async () => {
    vi.stubEnv("META_CORDIAL_ACCESS_TOKEN", "");
    vi.stubEnv("META_CORDIAL_PAGE_ACCESS_TOKEN", "page-secret");
    state.row.page_credential_ref = "META_CORDIAL_PAGE_ACCESS_TOKEN";
    expect((await resolvePageCredential("connection")).token).toBe("page-secret");
  });
});
