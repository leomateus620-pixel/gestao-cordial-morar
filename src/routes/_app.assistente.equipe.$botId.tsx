import { createFileRoute } from "@tanstack/react-router";
import { BotPresentation } from "@/components/assistant/TeamPages";
export const Route = createFileRoute("/_app/assistente/equipe/$botId")({
  head: () => ({ meta: [{ title: "Conheça seu agente — Cordial Bot" }] }),
  component: Page,
});
function Page() {
  const { botId } = Route.useParams();
  return <BotPresentation botId={botId} />;
}
