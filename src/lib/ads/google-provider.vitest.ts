import { afterEach, describe, expect, it, vi } from "vitest";
import { adsConfig, refreshGoogle } from "./oauth.server";
import {
  discoverGoogleAccounts,
  googleCustomerId,
  googleProvider,
  microsDecimal,
} from "./providers/google.server";

const page = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Google Ads read adapter", () => {
  it("does not require the retired developer token for OAuth", () => {
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    expect(adsConfig("google")).toEqual({ clientId: "id", clientSecret: "secret" });
  });
  it("preserves or updates the refresh token returned by Google", async () => {
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "secret");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page({ access_token: "new-access", expires_in: 3600 }))
      .mockResolvedValueOnce(
        page({ access_token: "newer-access", refresh_token: "new-refresh", expires_in: 3600 }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect((await refreshGoogle("old-refresh")).refreshToken).toBe("old-refresh");
    expect((await refreshGoogle("old-refresh")).refreshToken).toBe("new-refresh");
  });
  it("validates Google-specific customer IDs and keeps large micros exact", () => {
    expect(googleCustomerId("123-456-7890")).toBe("1234567890");
    expect(() => googleCustomerId("act_1234567890")).toThrow();
    expect(() => googleCustomerId("123-4567890")).toThrow();
    expect(microsDecimal("9007199254740993")).toBe("9007199254.740993");
  });
  it("paginates, keeps fractional conversions and sends no legacy token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page({
          results: [
            {
              segments: { date: "2026-10-01" },
              metrics: {
                impressions: "100",
                clicks: "7",
                costMicros: "1234567",
                conversions: 2.75,
              },
            },
          ],
          nextPageToken: "next",
        }),
      )
      .mockResolvedValueOnce(
        page({
          results: [
            {
              segments: { date: "2026-10-02" },
              metrics: { impressions: "5", clicks: "1", costMicros: "1" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const rows = await googleProvider.getInsights(
      "1234567890",
      "101",
      { since: "2026-10-01", until: "2026-10-02" },
      "token",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      spend: 1.234567,
      spendExact: "1.234567",
      conversions: 2.75,
      leads: 0,
      reach: null,
    });
    expect(rows[1]).toMatchObject({ spendExact: "0.000001", conversions: 0 });
    expect(fetcher.mock.calls[0][0]).toContain("/v26/customers/1234567890/googleAds:search");
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("developer-token");
    expect(JSON.parse(fetcher.mock.calls[1][1].body).pageToken).toBe("next");
  });
  it("rejects a partial paginated response instead of returning the first page", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(page({ results: [], nextPageToken: "next" }))
        .mockResolvedValueOnce(page({ error: { message: "secret" } }, 429)),
    );
    await expect(
      googleProvider.getInsights(
        "1234567890",
        "101",
        { since: "2026-10-01", until: "2026-10-02" },
        "token",
      ),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
  it("discovers direct advertiser and manager accounts without exposing tokens", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page({ resourceNames: ["customers/1234567890", "customers/1111111111"] }),
      )
      .mockResolvedValueOnce(
        page({
          results: [
            {
              customer: {
                id: "1234567890",
                descriptiveName: "Anunciante",
                currencyCode: "BRL",
                timeZone: "America/Sao_Paulo",
                manager: false,
                testAccount: true,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        page({
          results: [
            {
              customer: {
                id: "1111111111",
                descriptiveName: "Gerenciadora",
                currencyCode: "BRL",
                timeZone: "America/Sao_Paulo",
                manager: true,
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const accounts = await discoverGoogleAccounts("secret-token");
    expect(accounts).toMatchObject([
      { account_id: "1234567890", manager: false, testAccount: true },
      { account_id: "1111111111", manager: true },
    ]);
    expect(JSON.stringify(accounts)).not.toContain("secret-token");
    expect(fetcher.mock.calls[0][0]).toContain("customers:listAccessibleCustomers");
  });
  it("does not accept an injected date or oversized integer", async () => {
    await expect(
      googleProvider.getInsights(
        "1234567890",
        "101",
        { since: "2026-01-01' OR 1=1", until: "2026-10-02" },
        "token",
      ),
    ).rejects.toMatchObject({ code: "invalid_parameter" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        page({
          results: [
            { segments: { date: "2026-10-01" }, metrics: { impressions: "9007199254740993" } },
          ],
        }),
      ),
    );
    await expect(
      googleProvider.getInsights(
        "1234567890",
        "101",
        { since: "2026-10-01", until: "2026-10-02" },
        "token",
      ),
    ).rejects.toMatchObject({ code: "partial_data" });
  });
});
