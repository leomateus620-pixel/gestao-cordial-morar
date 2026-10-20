/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect } from "react";
import { stopped } from "./recorder-fixture";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { InspectionCentral } from "../../src/components/vistoria/central";
import { CreationWorkspace } from "../../src/components/vistoria/creation-workspace";
import { VistoriaWorkspace } from "../../src/components/vistoria/inspection-workspace";
import { InspectionDraftProvider } from "../../src/lib/vistoria/drafts";
import "../../src/styles.css";
const state = new URLSearchParams(location.search).get("state") ?? "list";
const fixtureId = "10000000-0000-4000-8000-000000000001";
function Component() {
  return state === "list" ? (
    <InspectionCentral />
  ) : state === "new" ? (
    <CreationWorkspace />
  ) : (
    <InspectionDraftProvider inspectionId={fixtureId}>
      <VistoriaWorkspace vistoriaId={fixtureId} />
    </InspectionDraftProvider>
  );
}
function Preview() {
  const [stopCount, setStopCount] = useState(stopped);
  const [render, setRender] = useState(0);
  useEffect(() => {
    const event = () => setStopCount(stopped);
    window.addEventListener("fixture-recorder", event);
    return () => window.removeEventListener("fixture-recorder", event);
  }, []);
  return (
    <div className="px-4">
      {new URLSearchParams(location.search).has("testing") && (
        <aside className="flex flex-wrap gap-2 border-b py-2 text-xs">
          <span>Fixture isolada · Áudios encerrados: {stopCount}</span>
          <button
            className="min-h-11 underline"
            onClick={() => {
              setRender(render + 1);
              void query.invalidateQueries();
            }}
          >
            Refetch e rerender
          </button>
        </aside>
      )}
      <Component />
      <Toaster />
    </div>
  );
}
const root = createRootRoute();
const route = createRoute({ getParentRoute: () => root, path: "/", component: Preview });
const router = createRouter({
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={query}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
