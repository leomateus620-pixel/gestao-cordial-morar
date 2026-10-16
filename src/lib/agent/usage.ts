import { z } from "zod";

export type GatewayUsage = { promptTokens: number; completionTokens: number; cachedTokens: number };
const tokens = z.number().int().nonnegative().max(100_000_000);
export function parseGatewayUsage(value: unknown): GatewayUsage | undefined {
  const parsed = z
    .object({
      prompt_tokens: tokens,
      completion_tokens: tokens,
      prompt_tokens_details: z.object({ cached_tokens: tokens.optional() }).optional(),
    })
    .safeParse(value);
  if (!parsed.success) return;
  const v = parsed.data;
  return {
    promptTokens: v.prompt_tokens,
    completionTokens: v.completion_tokens,
    cachedTokens: Math.min(v.prompt_tokens, v.prompt_tokens_details?.cached_tokens ?? 0),
  };
}
const rate = z
  .object({
    version: z.string().min(1).max(80),
    inputPerMillion: z.number().nonnegative().finite(),
    outputPerMillion: z.number().nonnegative().finite(),
    cachedPerMillion: z.number().nonnegative().finite().optional(),
  })
  .strict();
/** Rates are explicitly configured and versioned. Missing usage/rates are not zero cost. */
export function estimateGatewayCost(
  model: string,
  usage: GatewayUsage | undefined,
  config?: string,
) {
  try {
    const rates = z.record(z.string(), rate).parse(JSON.parse(config ?? "{}"));
    const r = rates[model];
    if (!usage || !r) return { estimatedCostUsd: null, rateVersion: null };
    return {
      estimatedCostUsd:
        ((usage.promptTokens - usage.cachedTokens) * r.inputPerMillion +
          usage.cachedTokens * (r.cachedPerMillion ?? r.inputPerMillion) +
          usage.completionTokens * r.outputPerMillion) /
        1_000_000,
      rateVersion: r.version,
    };
  } catch {
    return { estimatedCostUsd: null, rateVersion: null };
  }
}
