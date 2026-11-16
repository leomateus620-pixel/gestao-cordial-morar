import { z } from "zod";
import { brandSchema, filterPatchSchema } from "../public-property-bot/contracts";

export const insightDaysSchema = z.union([z.literal(1), z.literal(7), z.literal(30)]);
export type InsightDays = z.infer<typeof insightDaysSchema>;
const count = z.number().int().nonnegative();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().datetime({ offset: true });
const totals = {
  opens: count,
  sessions: count,
  conversations: count,
  messages: count,
  whatsapp: count,
};
export const brandInsightsSchema = z
  .object({
    brand: brandSchema,
    ...totals,
    daily: z.array(z.object({ date, ...totals }).strict()).max(30),
  })
  .strict();
export const botInsightsSchema = z
  .object({
    trackingSince: timestamp,
    period: z
      .object({
        days: insightDaysSchema,
        from: date,
        to: date,
        timezone: z.literal("America/Sao_Paulo"),
      })
      .strict(),
    brands: z.array(brandInsightsSchema).length(2),
  })
  .strict();
export const botConversationSchema = z
  .object({
    id: z.string().uuid(),
    brand: brandSchema,
    startedAt: timestamp,
    lastActivityAt: timestamp,
    messages: count,
    whatsapp: count,
    initialFilters: filterPatchSchema,
    latestFilters: filterPatchSchema,
    resultCount: count,
  })
  .strict();
export const botConversationListSchema = z
  .object({
    items: z.array(botConversationSchema).max(25),
    total: count,
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(25),
  })
  .strict();
export const whatsappSourceSchema = z.enum(["header", "card", "quota", "unavailable"]);
export const botEvolutionSchema = z
  .object({
    at: timestamp,
    kind: z.enum(["turn", "whatsapp"]),
    requestId: z.string().uuid().nullable(),
    state: z.enum(["pending", "completed", "interrupted"]).nullable(),
    question: z.string().max(1000).nullable(),
    answer: z.string().max(800).nullable(),
    revision: count.nullable(),
    filters: filterPatchSchema.nullable(),
    resultCount: count.nullable(),
    outcome: z.enum(["results", "question", "empty", "unavailable", "answer"]).nullable(),
    publicIds: z.array(z.string().uuid()).max(5),
    source: whatsappSourceSchema.nullable(),
  })
  .strict();
export const botConversationDetailSchema = botConversationSchema
  .extend({
    evolution: z.array(botEvolutionSchema).max(500),
    evolutionTotal: count,
    evolutionTruncated: z.boolean(),
  })
  .strict();
export type BrandInsights = z.infer<typeof brandInsightsSchema>;
export type BotInsights = z.infer<typeof botInsightsSchema>;
export type BotConversation = z.infer<typeof botConversationSchema>;
export type BotConversationList = z.infer<typeof botConversationListSchema>;
export type BotConversationDetail = z.infer<typeof botConversationDetailSchema>;
export type BotEvolution = z.infer<typeof botEvolutionSchema>;
export const insightsInputSchema = z.object({ days: insightDaysSchema }).strict();
export const conversationsInputSchema = z
  .object({
    brand: brandSchema,
    days: insightDaysSchema,
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export const conversationInputSchema = z
  .object({ brand: brandSchema, id: z.string().uuid() })
  .strict();
