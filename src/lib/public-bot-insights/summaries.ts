import type { BotConversation, BotEvolution } from "./contracts";
import { describeSearch } from "../public-property-bot/search-summary";
export { describeSearch };
export function summarizeConversation(session: BotConversation): string {
  if (!session.messages) return "Abriu o bot e ainda não enviou uma pergunta.";
  return describeSearch(session.latestFilters);
}
export function evolutionLabel(event: BotEvolution): string {
  if (event.kind === "whatsapp") return "Clicou no WhatsApp";
  if (event.state === "pending") return "Pedido recebido";
  if (event.state === "interrupted") return "Resposta interrompida";
  if (event.outcome === "unavailable") return "Serviço indisponível nesta resposta";
  if (event.outcome === "results")
    return `${event.resultCount ?? 0} ${(event.resultCount ?? 0) === 1 ? "imóvel apresentado" : "imóveis apresentados"}`;
  if (event.outcome === "empty") return "Nenhum imóvel com os critérios informados";
  return "Conversa e refinamento da busca";
}
