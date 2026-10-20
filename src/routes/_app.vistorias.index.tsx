import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { InspectionCentral } from "@/components/vistoria/central";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/vistorias/")({
  head: () => ({
    meta: [
      { title: "Vistoria inteligente — Gestão Cordial" },
      {
        name: "description",
        content:
          "Vistorias de entrada, saída, periódicas e constatação com fotos, relatos e laudo em PDF.",
      },
      { property: "og:title", content: "Vistoria inteligente — Gestão Cordial" },
      { property: "og:description", content: "Vistorias com fotos, relatos e laudo em PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="vistorias">
      <VistoriasPage />
    </RequireModuleAccess>
  ),
});
function VistoriasPage() {
  return <InspectionCentral />;
}
