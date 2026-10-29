import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertConnectionContext,
  credentialReference,
  decryptCredential,
  encryptCredential,
} from "./credentials.server";
import { signState, verifyState, authorizeUrl, metaOAuthScopes } from "./oauth.server";
import { recentAccountRange, syncRetry } from "./sync.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("Server credential references and encryption", () => {
  it("only accepts Meta access-token references", () => {
    expect(credentialReference("META_CORDIAL_ACCESS_TOKEN")).toBe("META_CORDIAL_ACCESS_TOKEN");
    for (const ref of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "VITE_META_ACCESS_TOKEN",
      "META_APP_SECRET",
      "META_ACCESS_TOKEN;env",
    ])
      expect(() => credentialReference(ref)).toThrow();
  });
  it("requires a separate server key and detects modified ciphertext", () => {
    vi.stubEnv("ADS_CREDENTIAL_ENCRYPTION_KEY", "");
    expect(() => encryptCredential("private-token")).toThrow();
    vi.stubEnv("ADS_CREDENTIAL_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    const encrypted = encryptCredential("private-token");
    expect(encrypted).not.toContain("private-token");
    expect(decryptCredential(encrypted)).toBe("private-token");
    expect(() => decryptCredential(encrypted.slice(0, -5) + "AAAAA")).toThrow();
  });
  it("rejects Google accounts until a connection has an explicit account binding", () => {
    const connection = {
      platform: "google" as const,
      imobiliaria: "cordial",
      external_account_id: null,
    };
    expect(() => assertConnectionContext(connection, { accountId: "1234567890" })).toThrow();
    expect(() =>
      assertConnectionContext(
        { ...connection, external_account_id: "1234567890" },
        { accountId: "123-456-7890" },
      ),
    ).not.toThrow();
    expect(() =>
      assertConnectionContext(
        { ...connection, external_account_id: "1234567890" },
        { accountId: "1111111111" },
      ),
    ).toThrow();
  });
  it("never selects a connection from another brand or account", () => {
    const connection = {
      platform: "meta" as const,
      imobiliaria: "cordial",
      external_account_id: "12345678901234567890",
    };
    expect(() => assertConnectionContext(connection, { imobiliaria: "morar" })).toThrow();
    expect(() =>
      assertConnectionContext({ ...connection, external_account_id: null }, { accountId: "123" }),
    ).toThrow();
    expect(() =>
      assertConnectionContext(connection, { accountId: "12345678901234567891" }),
    ).toThrow();
    expect(() =>
      assertConnectionContext(connection, {
        accountId: "act_12345678901234567890",
        imobiliaria: "cordial",
      }),
    ).not.toThrow();
  });
});
describe("OAuth signed state", () => {
  it("rejects altered, expired, future and malformed state", async () => {
    vi.stubEnv("META_APP_ID", "123");
    vi.stubEnv("META_APP_SECRET", "test-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const state = {
      u: "actor",
      p: "meta" as const,
      i: "cordial",
      t: Date.now(),
      n: "a".repeat(64),
    };
    const signed = await signState(state);
    expect(await verifyState(signed)).toEqual(state);
    expect(await verifyState(signed + ".extra")).toBeNull();
    expect(await verifyState(signed.slice(0, -1) + "X")).toBeNull();
    expect(await verifyState(await signState({ ...state, t: Date.now() + 120000 }))).toBeNull();
    vi.advanceTimersByTime(16 * 60000);
    expect(await verifyState(signed)).toBeNull();
  });
});
describe("Sync retry policy", () => {
  it("retries transient failures with bounded jitter and stops on missing permissions", () => {
    expect(syncRetry(1, "rate_limited", () => 0)).toEqual({ retry: true, delayMs: 24000 });
    expect(syncRetry(6, "provider_error").retry).toBe(false);
    for (const code of ["token_expired", "no_permission", "not_configured", "campaign_not_found"])
      expect(syncRetry(1, code).retry).toBe(false);
  });
});

describe("Account calendar", () => {
  it("uses the account timezone rather than the UTC date", () => {
    expect(recentAccountRange("America/Sao_Paulo", new Date("2026-10-26T01:00:00Z"))).toEqual({
      since: "2026-09-28",
      until: "2026-10-25",
    });
    expect(recentAccountRange("Asia/Tokyo", new Date("2026-10-26T01:00:00Z"))).toEqual({
      since: "2026-09-29",
      until: "2026-10-26",
    });
  });
});

describe("Explicit personal OAuth purpose", () => {
  it("keeps default read minimal and requests management only deliberately", () => {
    vi.stubEnv("META_APP_ID", "123");
    vi.stubEnv("META_APP_SECRET", "test-secret");
    const read = new URL(authorizeUrl("meta", "https://app.example/callback", "signed"));
    expect(read.searchParams.get("scope")).toBe("ads_read");
    expect(read.searchParams.has("auth_type")).toBe(false);
    const manage = new URL(
      authorizeUrl("meta", "https://app.example/callback", "signed", "manage"),
    );
    expect(manage.searchParams.get("scope")?.split(",")).toContain("ads_management");
    expect(manage.searchParams.get("auth_type")).toBe("rerequest");
    expect(metaOAuthScopes("leads")).toContain("leads_retrieval");
    expect(metaOAuthScopes("leads")).not.toContain("ads_management");
  });
  it("binds the requested purpose into the signed nonce state", async () => {
    vi.stubEnv("META_APP_ID", "123");
    vi.stubEnv("META_APP_SECRET", "test-secret");
    const state = {
      u: "actor",
      p: "meta" as const,
      i: "cordial",
      t: Date.now(),
      n: "a".repeat(64),
      s: "manage" as const,
    };
    expect(await verifyState(await signState(state))).toEqual(state);
    expect(await verifyState(await signState({ ...state, s: "unsupported" as never }))).toBeNull();
  });
});
