import { estimateGatewayCost, type GatewayUsage } from "./usage";

/** The privileged writer is restricted to assistant accounting, never business data. */
export async function recordAssistantUsage(input: {
  userId: string;
  botId: string;
  conversationId: string;
  model: string;
  usage?: GatewayUsage;
  durationMs: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cost = estimateGatewayCost(
    input.model,
    input.usage,
    process.env.ASSISTANT_MODEL_RATES_JSON,
  );
  const { error } = await (supabaseAdmin as any)
    .from("assistant_usage")
    .insert({
      user_id: input.userId,
      bot_id: input.botId,
      conversation_id: input.conversationId,
      model: input.model,
      prompt_tokens: input.usage?.promptTokens ?? null,
      completion_tokens: input.usage?.completionTokens ?? null,
      cached_tokens: input.usage?.cachedTokens ?? null,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      estimated_cost_usd: cost.estimatedCostUsd,
      rate_version: cost.rateVersion,
    })
    .abortSignal(AbortSignal.timeout(3000));
  if (error) throw new Error("Não foi possível registrar o uso do assistente.");
}
