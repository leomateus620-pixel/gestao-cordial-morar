import { z } from "zod";
import { maskAgentOutput } from "./masking";

export const actionTypes = [
  "agenda_event",
  "attendance_note",
  "attendance_stage_change",
  "shared_selection",
  "message_draft",
] as const;
export type ActionType = (typeof actionTypes)[number];
export type ActionStatus = "pending" | "confirmed" | "executed" | "failed" | "cancelled";
const id = z.string().uuid();
export const pipelineStages = [
  "primeiro_contato",
  "apresentando_solucao",
  "visita",
  "proposta",
  "fechamento",
  "perdido",
  "em_espera",
  "arquivado",
] as const;
export const actionSchemas = {
  agenda_event: z
    .object({
      title: z.string().trim().min(1).max(160),
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
      agency: z.enum(["cordial", "morar", "ambas"]),
      kind: z.enum(["visita", "reuniao", "retorno", "interno", "outro"]),
      attendanceId: id.optional(),
      clientId: id.optional(),
      propertyId: id.optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .strict()
    .refine(
      (v) =>
        Date.parse(v.end) > Date.parse(v.start) &&
        Date.parse(v.end) - Date.parse(v.start) <= 24 * 60 * 60_000,
      "O horário final deve ser depois do inicial, em até 24 horas.",
    ),
  attendance_note: z
    .object({ attendanceId: id, text: z.string().trim().min(1).max(4000) })
    .strict(),
  attendance_stage_change: z
    .object({
      attendanceId: id,
      to: z.enum(pipelineStages),
      reason: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((v) => v.to !== "perdido" || Boolean(v.reason?.trim()), "Informe o motivo da perda."),
  shared_selection: z
    .object({
      title: z.string().trim().min(1).max(120),
      agency: z.enum(["cordial", "morar"]),
      propertyIds: z.array(id).min(1).max(60),
      publicMessage: z.string().max(1000).default(""),
      clientId: id.optional(),
      expiresDays: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60)]).default(30),
      brokerId: id.optional(),
    })
    .strict(),
  message_draft: z.object({ attendanceId: id, text: z.string().trim().min(1).max(4000) }).strict(),
};
export type ActionPayload = { [K in ActionType]: z.infer<(typeof actionSchemas)[K]> }[ActionType];
export type ActionProposal = {
  id: string;
  type: ActionType;
  botId: string;
  conversationId?: string;
  revision: number;
  status: ActionStatus;
  expiresAt: string;
  title: string;
  summary: string;
  diff: Array<{ label: string; before?: string; after: string }>;
  payload: ActionPayload;
  result?: { href?: string; text?: string; draft?: string };
  errorCode?: string;
};
export const actionBots: Record<ActionType, string[]> = {
  agenda_event: ["agenda"],
  attendance_note: ["lead"],
  attendance_stage_change: ["lead"],
  shared_selection: ["match"],
  message_draft: ["lead"],
};
export const actionTitles: Record<ActionType, string> = {
  agenda_event: "Criar compromisso",
  attendance_note: "Registrar anotação",
  attendance_stage_change: "Alterar etapa do atendimento",
  shared_selection: "Criar seleção compartilhada",
  message_draft: "Preparar rascunho de mensagem",
};
export function parseActionPayload(type: ActionType, value: unknown): ActionPayload {
  const payload = maskAgentOutput(actionSchemas[type].parse(value)) as ActionPayload;
  if (type === "shared_selection" && "propertyIds" in payload)
    payload.propertyIds = [...new Set(payload.propertyIds)];
  return payload;
}
export function actionIsExpired(
  action: Pick<ActionProposal, "status" | "expiresAt">,
  now = Date.now(),
) {
  return action.status === "pending" && Date.parse(action.expiresAt) <= now;
}
export function assertActionMutable(
  action: Pick<ActionProposal, "revision" | "status" | "expiresAt">,
  revision: number,
  now = Date.now(),
) {
  if (action.revision !== revision)
    throw new Error("A proposta foi editada. Revise a versão atual antes de confirmar.");
  if (action.status !== "pending") throw new Error("Esta proposta não está mais pendente.");
  if (actionIsExpired(action, now))
    throw new Error("A proposta expirou. Peça uma nova proposta para atualizar os dados.");
}
