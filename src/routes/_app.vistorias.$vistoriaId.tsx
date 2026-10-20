import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { VistoriaWorkspace } from "@/components/vistoria/inspection-workspace";
import { useSession } from "@/lib/auth-mock";
import { InspectionDraftProvider } from "@/lib/vistoria/drafts";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/vistorias/$vistoriaId")({
  head: () => ({
    meta: [
      { title: "Vistoria — Gestão Cordial" },
      { name: "description", content: "Execução, revisão e laudo da vistoria." },
      { property: "og:title", content: "Vistoria — Gestão Cordial" },
      { property: "og:description", content: "Execução, revisão e laudo da vistoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="vistorias">
      <VistoriaPage />
    </RequireModuleAccess>
  ),
});

function VistoriaPage() {
  const { vistoriaId } = Route.useParams();
  const user = useSession();
  return (
    <InspectionDraftProvider key={`${user?.id}:${vistoriaId}`} inspectionId={vistoriaId}>
      <VistoriaWorkspace vistoriaId={vistoriaId} />
    </InspectionDraftProvider>
  );
}
