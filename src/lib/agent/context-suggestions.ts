import type { AgentBot } from "./bots";
import type { AssistantResult } from "./stream";
import type { RecordContext } from "./context-routing";

/** Suggestions describe available work, never claim facts or execute an action. */
export function contextualSuggestions(
  bot: AgentBot,
  context?: RecordContext,
  results: AssistantResult[] = [],
): string[] {
  if (!bot.active) return [];
  const suggestions: string[] = [];
  const can = (tool: string) => bot.tools.includes(tool);
  const scoped = context && bot.contextKinds.includes(context.kind) ? context : undefined;
  const match = results.find((r) => r.tool === "match_client_properties")?.data;
  if (
    Array.isArray(match?.missingCriteria) &&
    match.missingCriteria.length &&
    can("match_client_properties")
  )
    suggestions.push("Quais preferências faltam neste cadastro?");
  if (
    results.some((r) => Array.isArray(r.data.properties) && r.data.properties.length) &&
    can("prepare_shared_selection")
  )
    suggestions.push("Preparar seleção dos imóveis encontrados");
  if (scoped?.kind === "client" && can("match_client_properties"))
    suggestions.push("Encontrar imóveis compatíveis com este cliente");
  if (
    ["client", "property", "attendance"].includes(scoped?.kind ?? "") &&
    can("prepare_agenda_event")
  )
    suggestions.push("Preparar uma visita para este registro");
  if (scoped?.kind === "attendance" && can("prepare_attendance_note"))
    suggestions.push("Preparar uma nota para este atendimento");
  if (scoped?.kind === "attendance" && can("prepare_attendance_stage_change"))
    suggestions.push("Revisar a etapa deste atendimento");
  if (scoped?.kind === "rental" && can("rental_nfse_alerts"))
    suggestions.push("Consultar pendências fiscais");
  if (scoped?.kind === "agenciamento" && can("get_record_context"))
    suggestions.push("Consultar pendências desta captação");
  if (scoped && can("get_record_context")) suggestions.push("Resumir o registro em foco");
  // Results already occupy the screen; avoid repeating the introductory prompts.
  if (!results.length) suggestions.push(...bot.suggestions);
  return [...new Set(suggestions)].slice(0, 3);
}
