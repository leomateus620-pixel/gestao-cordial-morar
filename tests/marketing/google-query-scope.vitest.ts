import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  keys: [] as unknown[][],
  options: [] as Array<{ enabled: boolean }>,
  role: "admin_owner",
}));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => ({ id: "test-user", perfil: state.role }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/marketing/google-overview.functions", () => ({ getGoogleMarketingOverview: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
    state.keys.push(options.queryKey);
    state.options.push(options);
    return {};
  },
}));
import { useGoogleMarketing } from "../../src/hooks/useGoogleMarketing";
import { marketingSearchSchema } from "../../src/lib/marketing/query-state";

function Reader() {
  useGoogleMarketing(
    "cordial",
    marketingSearchSchema.parse({ platform: "google", accountId: "1234567890" }),
    { since: "2026-10-01", until: "2026-10-31" },
    true,
  );
  return null;
}
describe("Google Marketing query scope", () => {
  it("uses the same query key in the selector and content, allowing one shared fetch", () => {
    state.keys = [];
    state.options = [];
    state.role = "admin_owner";
    renderToStaticMarkup(createElement("div", {}, createElement(Reader), createElement(Reader)));
    expect(state.keys).toHaveLength(2);
    expect(state.keys[0]).toEqual(state.keys[1]);
    expect(state.options.every((option) => option.enabled)).toBe(true);
  });
  it("does not request Google data for the external Meta reviewer", () => {
    state.keys = [];
    state.options = [];
    state.role = "meta_reviewer";
    renderToStaticMarkup(createElement(Reader));
    expect(state.options[0].enabled).toBe(false);
  });
});
