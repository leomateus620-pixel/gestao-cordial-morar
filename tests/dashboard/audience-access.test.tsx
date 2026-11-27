import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SiteAudienceSection } from "@/components/dashboard/SiteAudienceSection";

import { createAudienceFixture } from "./audience-fixture";

const session = vi.hoisted(() => ({
  current: { id: "user-1", perfil: "corretor" },
  rpc: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => session.current }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: session.rpc } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/site-audience/report.functions", () => ({ getSiteAudienceReport: session.report }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("opens only the user's brands and drops the previous user's report on session change", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderSection = () => (
    <QueryClientProvider client={client}>
      <SiteAudienceSection />
    </QueryClientProvider>
  );
  session.rpc.mockResolvedValue({ data: ["morar"] });
  const fixture = createAudienceFixture("disabled");
  session.report.mockImplementation(({ data }) => fixture(data));
  const ui = render(renderSection());
  await screen.findByRole("heading", { name: "Audiência dos sites" });
  await waitFor(() => expect(session.report).toHaveBeenCalled());
  expect(session.report.mock.calls.every(([{ data }]) => data.brand === "morar")).toBe(true);
  expect(screen.queryByRole("tab", { name: /Cordial Imóveis/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Abrir site Morar/ }).getAttribute("href")).toContain(
    "imobiliariamorar",
  );

  session.current = { id: "user-2", perfil: "secretaria" };
  session.rpc.mockResolvedValue({ data: ["cordial", "morar"] });
  ui.rerender(renderSection());
  expect(screen.queryByRole("heading", { name: "Audiência dos sites" })).toBeNull();
  const cordial = await screen.findByRole("tab", { name: /Cordial Imóveis/ });
  expect(cordial.getAttribute("aria-selected")).toBe("true");
  const morar = screen.getByRole("tab", { name: /Morar Imóveis/ });
  fireEvent.mouseDown(morar, { button: 0, ctrlKey: false });
  await waitFor(() => expect(morar.getAttribute("aria-selected")).toBe("true"));
  expect(session.report.mock.calls.filter(([{ data }]) => data.brand === "morar")).toHaveLength(2);

  session.current = { id: "user-3", perfil: "corretor" };
  session.rpc.mockResolvedValue({ data: [] });
  ui.rerender(renderSection());
  await waitFor(() =>
    expect(client.getQueryData(["site-audience-brands", "user-3", "corretor"])).toEqual([]),
  );
  expect(screen.queryByRole("heading", { name: "Audiência dos sites" })).toBeNull();
  client.clear();
});
