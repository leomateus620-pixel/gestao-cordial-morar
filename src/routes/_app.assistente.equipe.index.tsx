import { createFileRoute } from "@tanstack/react-router";
import { TeamHome } from "@/components/assistant/TeamPages";
export const Route = createFileRoute("/_app/assistente/equipe/")({
  head: () => ({ meta: [{ title: "Conheça a equipe — Assistente Cordial" }] }),
  component: TeamHome,
});
