import { z } from "zod";
import type { AgentTool } from "./tools/types";
import { proposeRoutine } from "./routines.schemas";
import { memoryPreferences } from "./memory.schemas";
import { effectiveRole } from "./security";
export const routineTools: AgentTool[] = [
  {
    name: "prepare_routine",
    title: "Preparar uma rotina",
    description:
      "Prepara rotina de consultas do Gestão e aviso apenas ao próprio usuário. Nada é salvo ou agendado até clique em Confirmar.",
    roles: ["admin", "secretaria", "corretor"],
    inputSchema: z.object({ message: z.string().trim().min(4).max(1000) }).strict(),
    async handler(input, ctx) {
      const { assertAssistantBotEnabled } = await import("./bot-config.server");
      if (!ctx.agentBotId) throw new Error("Escolha um agente para preparar esta rotina.");
      await assertAssistantBotEnabled(ctx, ctx.agentBotId);
      const out = proposeRoutine(input.message),
        role = effectiveRole(ctx);
      if (
        (["broker_ranking", "market_digest"].includes(out.proposal.template) && role !== "admin") ||
        (out.proposal.template === "rentals_overdue" &&
          !["admin", "secretaria"].includes(role ?? ""))
      )
        throw new Error("Seu perfil não pode usar esta rotina.");
      return {
        content: [{ type: "text", text: "Revise a proposta e confirme para salvar a rotina." }],
        structuredContent: {
          routineProposal: out.proposal,
          requestId: crypto.randomUUID(),
          summary: out.summary,
          confirmationRequired: true,
        },
      };
    },
  },
  {
    name: "prepare_memory",
    title: "Preparar preferência",
    description:
      "Prepara somente tom, bairros de foco e horários pessoais. Nunca guarda proprietários, contatos, documentos ou instruções livres. Exige confirmação na UI.",
    roles: ["admin", "secretaria", "corretor", "financeiro"],
    inputSchema: z.object({ preferences: memoryPreferences }).strict(),
    async handler(input, ctx) {
      const { assertAssistantBotEnabled } = await import("./bot-config.server");
      if (!ctx.agentBotId) throw new Error("Escolha um agente para preparar esta preferência.");
      await assertAssistantBotEnabled(ctx, ctx.agentBotId);
      return {
        content: [{ type: "text", text: "Revise suas preferências e confirme para salvar." }],
        structuredContent: { memoryProposal: input.preferences, confirmationRequired: true },
      };
    },
  },
];
