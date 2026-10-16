import { actionSchemas, type ActionType } from "../actions";
import type { AgentTool } from "./types";
const tools: Array<[string, ActionType, string]> = [
  ["prepare_agenda_event", "agenda_event", "Preparar compromisso"],
  ["prepare_attendance_note", "attendance_note", "Preparar anotação"],
  ["prepare_attendance_stage_change", "attendance_stage_change", "Preparar mudança de etapa"],
  ["prepare_shared_selection", "shared_selection", "Preparar seleção compartilhada"],
  ["prepare_message_draft", "message_draft", "Preparar rascunho de mensagem"],
];
export const prepareActionTools: AgentTool[] = tools.map(([name, type, title]) => ({
  name,
  title,
  description: `${title}. Somente cria uma proposta pendente por 15 minutos. Nunca executa, confirma ou envia mensagens.`,
  roles: ["admin", "secretaria", "corretor"],
  inputSchema: actionSchemas[type],
  async handler(input, ctx) {
    const { prepareAssistantAction } = await import("../actions.server");
    const action = await prepareAssistantAction(ctx, type, input);
    return {
      content: [
        {
          type: "text",
          text: "Proposta preparada. Revise o cartão e clique em Confirmar no Gestão.",
        },
      ],
      structuredContent: { action },
    };
  },
}));
