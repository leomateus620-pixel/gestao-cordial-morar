import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { CreationWorkspace } from "@/components/vistoria/creation-workspace";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/vistorias/nova")({
  head: () => ({
    meta: [
      { title: "Nova vistoria — Gestão Cordial" },
      { name: "description", content: "Crie uma vistoria a partir de um imóvel cadastrado." },
      { property: "og:title", content: "Nova vistoria — Gestão Cordial" },
      {
        property: "og:description",
        content: "Crie uma vistoria a partir de um imóvel cadastrado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="vistorias">
      <NovaVistoria />
    </RequireModuleAccess>
  ),
});
function NovaVistoria() {
  return <CreationWorkspace />;
}
