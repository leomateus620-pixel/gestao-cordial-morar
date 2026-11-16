import type { BotAction, BotBrand } from "./contracts";
import type { PublicRepository } from "./repository.server";
import { publicPlainText } from "./privacy";
import { describeSearch } from "./search-summary";

export function insightQuestion(action: BotAction): string {
  let text: string;
  switch (action.kind) {
    case "text":
      text = action.text;
      break;
    case "filters":
      text = `Selecionou filtros: ${describeSearch(action.patch)}`;
      break;
    case "search":
      text = "Buscar novamente com os filtros atuais";
      break;
    case "reset":
      text = "Iniciar uma nova busca";
      break;
    case "property_question":
      text = `Perguntou se há ${action.feature}${action.scope === "condominium" ? " no condomínio" : " privativa"} em um imóvel apresentado`;
      break;
  }
  return publicPlainText(text).slice(0, 1000);
}
/** Bounded first-party operational recording; failures never consume extra turns or abort a search. */
export async function recordInsight(
  operation: "open" | "turn" | "whatsapp",
  brand: BotBrand,
  work: (signal: AbortSignal) => Promise<unknown>,
) {
  try {
    if ((await work(AbortSignal.timeout(1500))) !== true) {
      console.warn("[public-bot-insights]", { brand, operation, code: "record_rejected" });
    }
  } catch {
    console.warn("[public-bot-insights]", { brand, operation, code: "record_unavailable" });
  }
}
export async function recordTurnInsight(
  repo: PublicRepository,
  brand: BotBrand,
  hash: string,
  requestId: string,
  action: BotAction,
) {
  await recordInsight("turn", brand, (signal) =>
    repo.insightTurn(brand, hash, requestId, insightQuestion(action), signal),
  );
}
