import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  botInsightsSchema,
  botConversationListSchema,
  botConversationDetailSchema,
  insightsInputSchema,
  conversationsInputSchema,
  conversationInputSchema,
} from "./contracts";

async function privateResponse() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}

// These authenticated RPCs enforce admin + deny-dominant restricted-role checks in PostgreSQL.
// This module is never imported by the public bot backend. No service-role client is involved.
export const getPublicBotInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => insightsInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await privateResponse();
    const { data: result, error } = await context.supabase.rpc(
      "public_bot_insights" as never,
      { days: data.days } as never,
    );
    if (error) throw new Error("Não foi possível carregar o acompanhamento dos bots.");
    return botInsightsSchema.parse(result);
  });
export const getPublicBotConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => conversationsInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await privateResponse();
    const { data: result, error } = await context.supabase.rpc(
      "public_bot_conversations" as never,
      {
        b: data.brand,
        days: data.days,
        page: data.page,
        page_size: data.pageSize,
      } as never,
    );
    if (error) throw new Error("Não foi possível carregar as sessões do bot.");
    return botConversationListSchema.parse(result);
  });
export const getPublicBotConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => conversationInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await privateResponse();
    const { data: result, error } = await context.supabase.rpc(
      "public_bot_conversation" as never,
      { b: data.brand, id: data.id } as never,
    );
    if (error) throw new Error("Não foi possível carregar esta sessão.");
    return result == null ? null : botConversationDetailSchema.parse(result);
  });
