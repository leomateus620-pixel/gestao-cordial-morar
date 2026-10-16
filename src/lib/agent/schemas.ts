import { z } from "zod";
export const assistantContextInput = z
  .object({
    kind: z.enum(["property", "client", "attendance", "rental", "agenciamento", "agenda"]),
    id: z.string().uuid(),
  })
  .strict();
export const chatAssistantInput = z
  .object({
    botId: z.string().min(1).max(24),
    message: z.string().trim().min(1).max(4000),
    conversationId: z.string().uuid().optional(),
    context: assistantContextInput.optional(),
  })
  .strict();
export type ChatAssistantInput = z.infer<typeof chatAssistantInput>;
