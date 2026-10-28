import { afterEach, describe, expect, it, vi } from "vitest";
import {
  metaGraph,
  metaGraphCommand,
  metaPages,
  metaRetryDelayMs,
  resetMetaGraphTransportState,
} from "./meta.graph.server";
import { emptyMetaCapabilities, observedMetaCapability } from "./capabilities";
afterEach(() => {
  resetMetaGraphTransportState();
  vi.unstubAllGlobals();
});
const result = (value: unknown, init?: ResponseInit) => new Response(JSON.stringify(value), init);
describe("Graph security and operation semantics", () => {
  it.each([
    "//evil.test",
    "/../oauth/access_token",
    "/123?access_token=x",
    "/123/unknown",
    "/%2e%2e/123",
  ])("rejects path %s before fetch", async (path) => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    await expect(metaGraph(path, "secret")).rejects.toMatchObject({ code: "invalid_link" });
    expect(fn).not.toHaveBeenCalled();
  });
  it("uses manual redirects and refuses redirected credentials", async () => {
    const fn = vi.fn(
      async (_input: unknown, _init: unknown) =>
        new Response(null, { status: 302, headers: { Location: "https://evil.example" } }),
    );
    vi.stubGlobal("fetch", fn);
    await expect(metaGraph("/123", "secret")).rejects.toMatchObject({ code: "provider_error" });
    expect(fn.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
  it("never retries uncertain creation, even with readRetries enabled", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("token=secret name=private"));
    vi.stubGlobal("fetch", fn);
    await expect(
      metaGraphCommand(
        "/act_123/campaigns",
        "secret",
        { name: "Draft", status: "PAUSED" },
        { readRetries: 2 },
      ),
    ).rejects.toMatchObject({
      code: "outcome_uncertain",
      message: "Resultado não confirmado. Reconcilie na Meta antes de reenviar.",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it.each([new Response("<html>proxy failure</html>"), new Response(null, { status: 503 })])(
    "marks invalid command response uncertain",
    async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(metaGraphCommand("/123", "secret", { status: "PAUSED" })).rejects.toMatchObject({
        code: "outcome_uncertain",
      });
    },
  );
  it("keeps safe error codes, usage and request IDs without raw messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          result(
            {
              error: {
                code: 100,
                error_subcode: 33,
                message: "secret person",
                fbtrace_id: "safe_trace",
                is_transient: false,
              },
            },
            {
              status: 400,
              headers: {
                "x-app-usage": '{"call_count":80,"total_cputime":20,"total_time":50}',
                "retry-after": "5",
              },
            },
          ),
        ),
    );
    try {
      await metaGraph("/123", "secret");
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "invalid_parameter",
        diagnostics: {
          providerCode: 100,
          providerSubcode: 33,
          requestId: "safe_trace",
          transient: false,
          retryAfterSeconds: 5,
          usage: { callCount: 80 },
        },
      });
      expect(JSON.stringify(error)).not.toContain("secret person");
    }
  });
  it("will not repeat a known expired credential", async () => {
    const fn = vi.fn().mockResolvedValue(result({ error: { code: 190 } }, { status: 400 }));
    vi.stubGlobal("fetch", fn);
    for (let n = 0; n < 2; n++)
      await expect(metaGraph("/123", "secret")).rejects.toMatchObject({ code: "token_expired" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("keeps cursor on the same resource", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          result({
            data: [],
            paging: { next: "https://graph.facebook.com/v26.0/999/leads?after=x" },
          }),
        ),
    );
    await expect(metaPages("/123/leads", "secret")).rejects.toMatchObject({
      code: "no_permission",
    });
  });
  it("restricts credential query exceptions to debug_token", async () => {
    const fn = vi.fn().mockResolvedValue(result({ data: { is_valid: true } }));
    vi.stubGlobal("fetch", fn);
    await expect(metaGraph("/me", "secret", { access_token: "secret" })).rejects.toMatchObject({
      code: "invalid_parameter",
    });
    await expect(metaGraph("/me", "secret", { input_token: "secret" })).rejects.toMatchObject({
      code: "invalid_parameter",
    });
    await metaGraph("/debug_token", "app-secret", { input_token: "user-token" });
    expect(String(fn.mock.calls[0][0])).toContain("input_token=user-token");
    expect(fn.mock.calls[0][1].headers.Authorization).toBe("Bearer app-secret");
  });
  it("allows at most two in-flight requests per credential/context", async () => {
    let active = 0,
      max = 0;
    const releases: Array<() => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        active++;
        max = Math.max(max, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        return result({ id: "123" });
      }),
    );
    const promises = Array.from({ length: 4 }, () => metaGraph("/123", "same-token"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(max).toBe(2);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 0));
    releases.splice(0).forEach((release) => release());
    await Promise.all(promises);
    expect(max).toBe(2);
  });
  it("bounds jitter and honors provider retry delay", () => {
    expect(metaRetryDelayMs(0, 5, () => 0)).toBe(5000);
    expect(metaRetryDelayMs(50, 1000, () => 1)).toBe(60000);
  });
});
describe("capability evidence", () => {
  it("scope/read do not certify writing, publication or end-to-end leads", () => {
    const matrix = emptyMetaCapabilities();
    matrix.account_read = observedMetaCapability(true, "2026-10-28T00:00:00Z", "graph_read");
    matrix.ads_management_scope = observedMetaCapability(
      true,
      "2026-10-28T00:00:00Z",
      "token_debug",
    );
    expect(matrix.write_validated.state).toBe("unverified");
    expect(matrix.app_published.state).toBe("unverified");
    expect(matrix.lead_received.state).toBe("unverified");
  });
});
