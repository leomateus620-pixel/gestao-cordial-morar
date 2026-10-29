import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { marketingSearchSchema } from "../../src/lib/marketing/query-state";

const state = vi.hoisted(() => ({
  data: null as null | {
    accounts: object[];
    lastCollectedAt: string | null;
    timezone: string | null;
  },
  isError: false,
  isFetching: false,
  isLoading: false,
}));
vi.mock("@/hooks/useGoogleMarketing", () => ({
  useGoogleMarketing: () => ({ query: { ...state, refetch: vi.fn() }, sortAllowed: true }),
}));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => ({ id: "synthetic" }) }));
vi.mock("@/lib/access-control", () => ({ isAdminUser: () => true }));
vi.mock("../../src/components/marketing/GoogleMarketingView", () => ({
  GoogleMarketingView: () => createElement("div", {}, "Conteúdo anterior"),
  googleColumnPreferenceKey: () => "test",
}));
import {
  GoogleMarketingSection,
  collectionTimestamp,
} from "../../src/components/marketing/GoogleMarketingSection";

const props = {
  agency: "cordial" as const,
  filters: marketingSearchSchema.parse({ platform: "google" }),
  range: { since: "2026-10-01", until: "2026-10-31" },
  onChange: vi.fn(),
  canViewFinancialInsights: true,
};
describe("Google background refresh", () => {
  it("keeps previously loaded data visible after a failed update with a dated retry", () => {
    state.data = {
      accounts: [{}],
      lastCollectedAt: "2026-10-26T12:00:00Z",
      timezone: "America/Sao_Paulo",
    };
    state.isError = true;
    state.isFetching = false;
    state.isLoading = false;
    const html = renderToStaticMarkup(createElement(GoogleMarketingSection, props));
    expect(html).toContain("Conteúdo anterior");
    expect(html).toContain("Não foi possível atualizar");
    expect(html).toContain("26/10/2026, 09:00:00 (America/Sao_Paulo)");
    expect(html).toContain("Tentar novamente");
  });
  it("does not claim previous data exists when an initial load fails", () => {
    state.data = null;
    state.isError = true;
    state.isFetching = false;
    state.isLoading = false;
    const html = renderToStaticMarkup(createElement(GoogleMarketingSection, props));
    expect(html).toContain("Não foi possível carregar");
    expect(html).not.toContain("Conteúdo anterior");
  });
  it("reports an unknown collection time rather than inventing one", () => {
    expect(collectionTimestamp(null, "America/Sao_Paulo")).toBe(
      "Data da última coleta indisponível",
    );
    expect(collectionTimestamp("2026-10-26T12:00:00Z", "Invalid/Zone")).toContain("(UTC)");
  });
});
