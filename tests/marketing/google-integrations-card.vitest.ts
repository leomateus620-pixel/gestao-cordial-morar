import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => ({ id: "test-user" }) }));
vi.mock("@/lib/access-control", () => ({ isAdminUser: () => state.admin }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/ads/ads.functions", () => ({ listGoogleAccounts: {}, selectGoogleAccount: {} }));
vi.mock("@/hooks/useAds", () => ({
  useAds: () => ({
    connections: [
      {
        id: "connection",
        platform: "google",
        configured: true,
        imobiliaria: "cordial",
        accountId: null,
        status: "error",
      },
    ],
    connectionsLoading: false,
    connectionsError: false,
    connect: vi.fn(),
  }),
}));
import { GoogleAdsCard } from "../../src/components/integracoes/GoogleAdsCard";

describe("Google account setup", () => {
  it("allows account discovery after an OAuth connection awaiting validation", () => {
    state.admin = true;
    const html = renderToStaticMarkup(createElement(GoogleAdsCard));
    expect(html).toContain("Consultar contas acessíveis");
    expect(html).toContain("Nenhuma conta selecionada");
    expect(html).not.toContain("Conectado e pronto");
  });
  it("does not render the Google administrative panel for an external reviewer", () => {
    state.admin = false;
    expect(renderToStaticMarkup(createElement(GoogleAdsCard))).toBe("");
  });
});
