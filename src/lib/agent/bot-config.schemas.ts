import { z } from "zod";
import type { AgentBot } from "./bots";
export const configuredBotIds = [
  "agenda",
  "match",
  "capta",
  "lead",
  "caixa",
  "time",
  "mercado",
] as const;
export const configuredBotId = z.enum(configuredBotIds);
export const botConfigInput = z
  .object({
    id: configuredBotId,
    expectedRevision: z.number().int().min(1),
    enabled: z.boolean(),
    instructions: z.string().trim().max(4000),
    suggestions: z.array(z.string().trim().min(3).max(180)).max(5),
    confirmed: z.literal(true),
  })
  .strict();
export const botConfigReset = z
  .object({
    id: configuredBotId,
    expectedRevision: z.number().int().min(1),
    confirmed: z.literal(true),
  })
  .strict();
export const mcpClientInput = z
  .object({
    clientId: z
      .string()
      .trim()
      .min(4)
      .max(200)
      .regex(/^[a-zA-Z0-9_.:-]+$/),
    name: z.string().trim().min(2).max(100),
    approved: z.boolean(),
    expectedRevision: z.number().int().min(0),
    confirmed: z.literal(true),
  })
  .strict();
export type PublicAgentBot = Omit<AgentBot, "instructions">;
export type BotConfigAdminDTO = {
  id: string;
  enabled: boolean;
  instructions: string;
  suggestions: string[];
  revision: number;
  updatedAt: string | null;
};
export type McpClientAdminDTO = {
  clientId: string;
  name: string;
  approved: boolean;
  revision: number;
  updatedAt: string | null;
};
export type AssistantAdminConfigDTO = {
  bots: BotConfigAdminDTO[];
  clients: McpClientAdminDTO[];
  oauthConfigured: boolean;
  clientsLimited: boolean;
};
