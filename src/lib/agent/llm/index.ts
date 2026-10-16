import type { GatewayCompletion, GatewayRequest } from "../chat.server";
import { isChatCompletionsModel } from "../model-routing";

/** Single entry point: Gemini via Chat Completions, Claude via native Messages. */
export async function modelCompletion(
  request: GatewayRequest,
  config: { apiKey: string; model: string; maxTokens?: number; fetcher?: typeof fetch },
): Promise<GatewayCompletion> {
  if (isChatCompletionsModel(config.model)) {
    const { lovableCompletion } = await import("../chat.server");
    return lovableCompletion(request, config);
  }
  const { anthropicCompletion } = await import("./anthropic");
  return anthropicCompletion(request, config);
}
