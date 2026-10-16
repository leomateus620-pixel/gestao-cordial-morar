/** Model selection by env; analysis tier is reserved for heavier work. Pure for tests. */
export type AssistantTier = "router" | "fast" | "analysis";

export const ASSISTANT_MODEL_DEFAULTS: Record<AssistantTier, string> = {
  router: "google/gemini-3.1-flash-lite",
  fast: "google/gemini-3.8-flash",
  analysis: "anthropic/claude-sonnet-5",
};

export function assistantModel(tier: AssistantTier, env: Record<string, string | undefined>) {
  const key = {
    router: "ASSISTANT_ROUTER_MODEL",
    fast: "ASSISTANT_FAST_MODEL",
    analysis: "ASSISTANT_ANALYSIS_MODEL",
  }[tier];
  return env[key]?.trim() || ASSISTANT_MODEL_DEFAULTS[tier];
}

/** Short answers get 1200 tokens, reports and analyses 4000. */
export function assistantMaxTokens(tier: AssistantTier) {
  return tier === "analysis" ? 4000 : 1200;
}

export function isChatCompletionsModel(model: string) {
  return !model.startsWith("anthropic/");
}

/** Interim tier choice until the Etapa 2 router replaces it. */
export function interimTier(message: string): AssistantTier {
  return /analis|compar|carteira|relat[oó]rio|cen[aá]rio|tend[eê]ncia/i.test(message)
    ? "analysis"
    : "fast";
}
