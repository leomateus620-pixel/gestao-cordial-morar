import { afterEach, describe, expect, it, vi } from "vitest";
import {
  metaGraph,
  metaPages,
  safeNextUrl,
  resetMetaGraphTransportState,
} from "./meta.graph.server";
import { metaProvider, selectLeadAction } from "./providers/meta.server";
import { AdProviderError } from "./types";
const page = (data: unknown[], next?: string) =>
  new Response(JSON.stringify({ data, paging: next ? { next } : undefined }), { status: 200 });
afterEach(() => {
  resetMetaGraphTransportState();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Meta transport", () => {
  it("reads beyond ten pages and strips provider credentials from cursor URLs", async () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
    const fetcher = vi.fn().mockImplementation((_url, init) => {
      const n = fetcher.mock.calls.length;
      expect(init.headers.Authorization).toBe("Bearer server-token");
      if (n > 1) expect(String(_url)).not.toContain("access_token");
      return Promise.resolve(
        page(
          [{ id: String(n) }],
          n < 13
            ? `https://graph.facebook.com/v26.0/me/adaccounts?after=${n}&access_token=provider-secret`
            : undefined,
        ),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await metaPages("/me/adaccounts", "server-token")).toHaveLength(13);
  });
  it("fails instead of returning a successful partial series", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          page([{ id: "1" }], "https://graph.facebook.com/v26.0/me/adaccounts?after=1"),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { code: 4, message: "TOKEN=private" } }), {
            status: 429,
          }),
        ),
    );
    await expect(metaPages("/me/adaccounts", "server-token")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
  it.each([
    "http://graph.facebook.com/v26.0/me/adaccounts",
    "https://evil.example/v26.0/me/adaccounts",
    "https://graph.facebook.com.evil.example/v26.0/me/adaccounts",
    "https://user:secret@graph.facebook.com/v26.0/me/adaccounts",
    "https://graph.facebook.com/v21.0/me/adaccounts",
  ])("rejects untrusted cursor %s", (url) => {
    expect(() => safeNextUrl(url)).toThrow(AdProviderError);
  });
  it("does not leak provider errors, even for revoked credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 190, message: "private-token private-person" } }),
            { status: 400 },
          ),
        ),
    );
    await expect(metaGraph("/me", "secret")).rejects.toMatchObject({
      code: "token_expired",
      message: "Conexão expirada. Conecte novamente.",
    });
  });
  it("sanitizes network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("token=secret")));
    await expect(metaGraph("/me", "secret")).rejects.toMatchObject({
      code: "provider_error",
      message: "A Meta não respondeu no prazo.",
    });
  });
  it("rejects a campaign outside the explicitly selected account", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "100", account_id: "200", name: "Campaign" })),
        ),
    );
    await expect(metaProvider.getCampaign("act_300", "100", "secret")).rejects.toMatchObject({
      code: "no_permission",
    });
  });
  it("rejects cyclic cursors as partial", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(page([], "https://graph.facebook.com/v26.0/me/adaccounts?after=1")),
        ),
    );
    await expect(metaPages("/me/adaccounts", "secret")).rejects.toMatchObject({
      code: "partial_data",
    });
  });
});
describe("Lead reporting taxonomy", () => {
  it("chooses the explicit instant-form family once rather than summing or maximizing aliases", () => {
    expect(
      selectLeadAction([
        { action_type: "lead", value: "90" },
        { action_type: "onsite_conversion.lead_grouped", value: "5" },
        { action_type: "offsite_conversion.fb_pixel_lead", value: "60" },
      ]),
    ).toEqual({ leads: 5, type: "onsite_conversion.lead_grouped" });
  });
  it("preserves an explicit zero and falls back only when a family is absent", () => {
    expect(
      selectLeadAction([
        { action_type: "onsite_conversion.lead_grouped", value: "0" },
        { action_type: "lead", value: "8" },
      ]),
    ).toEqual({ leads: 0, type: "onsite_conversion.lead_grouped" });
    expect(
      selectLeadAction([{ action_type: "offsite_conversion.fb_pixel_lead", value: "8" }]),
    ).toEqual({ leads: 8, type: "offsite_conversion.fb_pixel_lead" });
  });
});

describe("Meta metric evidence is never fabricated", () => {
  const campaign = () =>
    new Response(JSON.stringify({ id: "100", account_id: "200", name: "Synthetic" }));
  const range = { since: "2026-10-01", until: "2026-10-02" };
  it("rejects missing required spend instead of confirming zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(campaign())
        .mockResolvedValueOnce(
          page([{ date_start: "2026-10-01", impressions: "12", clicks: "3" }]),
        ),
    );
    await expect(metaProvider.getInsights("200", "100", range, "synthetic")).rejects.toMatchObject({
      code: "partial_data",
    });
  });
  it("keeps suppressed optional reach/frequency unavailable while preserving explicit zeros", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(campaign())
        .mockResolvedValueOnce(
          page([{ date_start: "2026-10-01", impressions: "0", clicks: "0", spend: "0" }]),
        ),
    );
    const rows = await metaProvider.getInsights("200", "100", range, "synthetic");
    expect(rows[0]).toMatchObject({
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: null,
      frequency: null,
    });
    expect(rows[0].landingPageViews).toBeUndefined();
  });
  it("rejects duplicate daily rows before the destructive batch commit", async () => {
    const row = { date_start: "2026-10-01", impressions: "10", clicks: "2", spend: "3" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(campaign())
        .mockResolvedValueOnce(page([row, row])),
    );
    await expect(metaProvider.getInsights("200", "100", range, "synthetic")).rejects.toMatchObject({
      code: "partial_data",
    });
  });
});
