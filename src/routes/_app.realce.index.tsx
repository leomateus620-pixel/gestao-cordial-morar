import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { RealcePage } from "@/components/realce/RealcePage";

export const Route = createFileRoute("/_app/realce/")({
  validateSearch: (s: Record<string, unknown>): { teste?: string } =>
    typeof s.teste === "string" && /^[0-9a-f-]{36}$/i.test(s.teste) ? { teste: s.teste } : {},
  head: () => ({
    meta: [
      { title: "Realce — Gestão Cordial" },
      { name: "description", content: "Aprimore fotos de imóveis de forma natural, compare com a original e baixe." },
      { property: "og:title", content: "Realce — Gestão Cordial" },
      { property: "og:description", content: "Tratamento natural de fotografias imobiliárias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RealceRoute,
});

function RealceRoute() {
  const { teste } = Route.useSearch();
  return (
    <RequireModuleAccess module="realce">
      <RealcePage testId={teste ?? null} />
    </RequireModuleAccess>
  );
}
