import { z } from "zod";
import { maskText } from "./masking";
import { operationalRoles } from "./security";
import type { AgentTool } from "./tools/types";

export type AssistantChoice = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; value: string }>;
  allowOther: true;
};
export const choiceInput = z
  .object({
    question: z.string().trim().min(4).max(160),
    choices: z.array(z.string().trim().min(1).max(80)).min(2).max(4),
  })
  .strict();
const safeLabel = (text: string) =>
  maskText(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim();

/** A conversational decision has no action payload, record IDs or executable callback. */
export function assistantChoice(input: unknown, id: string): AssistantChoice {
  const parsed = choiceInput.parse(input);
  const question = safeLabel(parsed.question);
  const labels = [...new Set(parsed.choices.map(safeLabel).filter(Boolean))];
  if (!question || labels.length < 2) throw new Error("invalid_choice");
  return {
    id,
    question,
    options: labels.map((label, i) => ({ id: String(i), label, value: label })),
    allowOther: true,
  };
}
/** Internal control tool. Intentionally excluded from the business registry and MCP. */
export const userChoiceTool: AgentTool = {
  name: "request_user_choice",
  title: "Aguardando sua escolha",
  description:
    "Peça uma decisão ou informação que falta com uma pergunta curta e 2–4 opções. Use o contexto e os resultados já consultados para não repetir perguntas. As opções são respostas do usuário, nunca confirmação de ação ou execução. Não invente registros ou fatos nas opções. Encerra o turno para aguardar a pessoa.",
  roles: operationalRoles,
  inputSchema: choiceInput,
  handler: async () => {
    throw new Error("conversation_control_only");
  },
};
