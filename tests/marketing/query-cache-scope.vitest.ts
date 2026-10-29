import { describe, expect, it } from "vitest";
import { sameMarketingPlaceholderScope } from "../../src/lib/marketing/query-cache-scope";

describe("Marketing placeholder data scope", () => {
  it("never shows Meta data while switching to Google, even for identical account IDs", () => {
    const meta = { imobiliaria: "cordial" as const, platform: "meta" as const, accountId: "123" };
    expect(sameMarketingPlaceholderScope(meta, { ...meta, platform: "google" })).toBe(false);
    expect(sameMarketingPlaceholderScope(meta, { ...meta, platform: null })).toBe(false);
  });
  it("keeps other agency or account data separate while allowing same-scope refreshes", () => {
    const scope = { imobiliaria: "cordial" as const, platform: "meta" as const, accountId: "123" };
    expect(sameMarketingPlaceholderScope(scope, { ...scope, imobiliaria: "morar" })).toBe(false);
    expect(sameMarketingPlaceholderScope(scope, { ...scope, accountId: "456" })).toBe(false);
    expect(sameMarketingPlaceholderScope(scope, { ...scope, since: "2026-10-01" })).toBe(true);
    expect(sameMarketingPlaceholderScope(undefined, scope)).toBe(false);
  });
});
