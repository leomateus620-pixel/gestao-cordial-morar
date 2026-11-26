/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from "react";
import { stopped } from "./recorder-fixture";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { InspectionCentral } from "../../src/components/vistoria/central";
import { CreationWorkspace } from "../../src/components/vistoria/creation-workspace";
import { VistoriaWorkspace } from "../../src/components/vistoria/inspection-workspace";
import { RentalEntryInspection } from "../../src/components/alugueis/RentalEntryInspection";
import { InspectionDraftProvider } from "../../src/lib/vistoria/drafts";
import { contractId, id } from "./transport-fixture";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const initial = params.get("state") ?? "list";

if (params.has("camera")) {
  let calls = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => {
        if (params.get("camera") === "negada") throw new DOMException("", "NotAllowedError");
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1440;
        const ctx = canvas.getContext("2d")!;
        const session = ++calls;
        let frame = 0;
        const draw = () => {
          ctx.fillStyle = session % 2 ? "#b6815e" : "#436977";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#e7d9bd";
          ctx.fillRect(150, 220, 1620, 970);
          ctx.fillStyle = "#1d3b40";
          ctx.fillRect(230, 500, 1460, 90);
          ctx.font = "64px sans-serif";
          ctx.fillText("VÍDEO SIMULADO", 225, 425);
          ctx.fillText(`Sessão ${session} · quadro ${frame++}`, 225, 930);
        };
        draw();
        const stream = canvas.captureStream(10);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        const timer = window.setInterval(draw, 100);
        track.stop = () => {
          window.clearInterval(timer);
          stop();
          canvas.width = canvas.height = 0;
        };
        return stream;
      },
    },
  });
}

const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Layout() {
  const [stopCount, setStopCount] = useState(stopped);
  useEffect(() => {
    const event = () => setStopCount(stopped);
    window.addEventListener("fixture-recorder", event);
    return () => window.removeEventListener("fixture-recorder", event);
  }, []);
  return (
    <div className="px-4">
      {params.has("testing") && (
        <aside className="flex flex-wrap items-center gap-3 border-b py-2 text-xs">
          <span>Prévia isolada · Áudios encerrados: {stopCount}</span>
          <button className="min-h-11 underline" onClick={() => void query.invalidateQueries()}>
            Atualizar consultas
          </button>
        </aside>
      )}
      <Outlet />
      <Toaster />
    </div>
  );
}
const root = createRootRoute({ component: Layout });
const app = createRoute({ getParentRoute: () => root, id: "_app" });
const central = createRoute({
  getParentRoute: () => app,
  path: "/vistorias",
  component: InspectionCentral,
});
const creation = createRoute({
  getParentRoute: () => app,
  path: "/vistorias/nova",
  component: () => <CreationWorkspace />,
});
const detail = createRoute({
  getParentRoute: () => app,
  path: "/vistorias/$vistoriaId",
  validateSearch: (search) => ({
    central: search.central === true,
    comodo: typeof search.comodo === "string" ? search.comodo : undefined,
  }),
  component: function Detail() {
    const { vistoriaId } = detail.useParams();
    const { central, comodo } = detail.useSearch();
    return (
      <InspectionDraftProvider key={vistoriaId} inspectionId={vistoriaId}>
        <VistoriaWorkspace vistoriaId={vistoriaId} fromCentral={central} resumeRoom={comodo} />
      </InspectionDraftProvider>
    );
  },
});
const rental = createRoute({
  getParentRoute: () => app,
  path: "/alugueis",
  component: () => (
    <section className="mx-auto max-w-4xl space-y-3 py-6">
      <h1 className="text-xl font-semibold">Locação de homologação</h1>
      <RentalEntryInspection contractId={contractId} sectionId="entrada" />
      <RentalEntryInspection contractId={contractId} sectionId="saida" kind="saida" />
      <Link to="/vistorias" className="inline-flex min-h-11 items-center text-primary">
        Central de vistorias
      </Link>
    </section>
  ),
});
const router = createRouter({
  routeTree: root.addChildren([app.addChildren([central, creation, detail, rental])]),
  history: createMemoryHistory({
    initialEntries: [
      initial === "rental"
        ? "/alugueis"
        : initial === "new"
          ? "/vistorias/nova"
          : initial === "room"
            ? `/vistorias/${id}`
            : "/vistorias",
    ],
  }),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={query}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
