import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assistantContextInput, chatAssistantInput } from "./schemas";
import type { AssistantConversation, AssistantMessage, AssistantResult } from "./stream";
import { assistantScopeKey } from "./scope";

/** This is deliberately a new client made with the verified caller token.
 * No browser-supplied roles or service-role client enter the tools. */
async function callerContext(userId: string) {
  const [{ supabaseForUser }, { loadAgentContext }] = await Promise.all([
    import("@/lib/mcp/supabase"),
    import("./tools"),
  ]);
  const request = getRequest();
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Sessão inválida. Entre novamente.");
  const supabase = supabaseForUser({ getToken: () => token });
  return loadAgentContext(supabase, userId, request.signal);
}

export const chatAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => chatAssistantInput.parse(value))
  .handler(async ({ data, context }): Promise<Response> => {
    const [
      { createAssistantResponse },
      { persistAssistantTurn },
      { assertBotContextScope },
      { agentTools, executeAgentTool },
      { effectiveRole },
    ] = await Promise.all([
      import("./chat.server"),
      import("./persistence.server"),
      import("./bots"),
      import("./tools"),
      import("./security"),
    ]);
    const ctx = await callerContext(context.userId);
    const { resolveAgentBot, assertAssistantBotEnabled } = await import("./bot-config.server");
    const bot = await resolveAgentBot(data.botId, ctx);
    if (!bot?.active || !bot.roles.some((role) => role === effectiveRole(ctx)))
      throw new Error("Este agente não está disponível para seu perfil.");
    assertBotContextScope(bot, data.context);
    const key = process.env.LOVABLE_API_KEY;
    if (!key)
      throw new Error(
        "O Cordial Bot ainda não foi configurado. Solicite a configuração ao administrador.",
      );
    const persistence = await persistAssistantTurn({
      client: ctx.supabase,
      userId: ctx.userId,
      botId: bot.id,
      scopeKey: assistantScopeKey(ctx),
      message: data.message,
      conversationId: data.conversationId,
    });
    const routing = await import("./model-routing");
    const { routeMessage } = await import("./orchestrator/router");
    const routerModel = routing.assistantModel("router", process.env);
    const { decision, tier } = await routeMessage(data.message, {
      apiKey: key,
      model: routerModel,
      signal: getRequest().signal,
    });
    const model = routing.assistantModel(tier, process.env);
    const maxTokens = routing.assistantMaxTokens(tier);
    const routedBot =
      decision.intent === "pesquisa"
        ? {
            ...bot,
            instructions: `${bot.instructions} A pesquisa na internet ainda não está disponível neste agente: avise a pessoa e não finja ter buscado dados externos.`,
          }
        : bot;
    const { modelCompletion } = await import("./llm");
    const { memoryPreferences } = await import("./memory.schemas");
    const memory = await ctx.supabase
      .from("assistant_memory")
      .select("preferences")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (memory.error)
      throw new Error(
        "Não foi possível consultar suas preferências. Confira a configuração do assistente.",
      );
    const preferences = memory.data
      ? memoryPreferences.safeParse(memory.data.preferences)
      : undefined;
    return createAssistantResponse(data, {
      bot: routedBot,
      ctx,
      tools: [...agentTools],
      persistence,
      preferences: preferences?.success ? preferences.data : undefined,
      validateBot: () => assertAssistantBotEnabled(ctx, bot.id),
      signal: getRequest().signal,
      gateway: async (request) => {
        const started = Date.now();
        const completion = await modelCompletion(request, { apiKey: key, model, maxTokens });
        const { recordAssistantUsage } = await import("./usage.server");
        await recordAssistantUsage({
          userId: ctx.userId,
          botId: bot.id,
          conversationId: persistence.conversationId,
          model,
          usage: completion.usage,
          durationMs: Date.now() - started,
        });
        return completion;
      },
      execute: executeAgentTool,
    });
  });

export const listAssistantConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        botId: z.string().max(24).optional(),
        limit: z.number().int().min(1).max(50).default(30),
      })
      .strict()
      .parse(value ?? {}),
  )
  .handler(async ({ data, context }): Promise<AssistantConversation[]> => {
    const ctx = await callerContext(context.userId);
    let query = ctx.supabase
      .from("assistant_conversations")
      .select("id,bot_id,title,updated_at")
      .eq("user_id", ctx.userId)
      .eq("scope_key", assistantScopeKey(ctx))
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.botId) query = query.eq("bot_id", data.botId);
    const rows = await query;
    if (rows.error) throw new Error("Não foi possível carregar as conversas.");
    const { maskAgentOutput } = await import("./masking");
    return maskAgentOutput(rows.data ?? []) as AssistantConversation[];
  });

export const listAssistantMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ conversationId: z.string().uuid() }).strict().parse(value),
  )
  .handler(async ({ data, context }): Promise<AssistantMessage[]> => {
    const ctx = await callerContext(context.userId);
    const [
      { readOwnedAssistantHistory, persistAssistantAudit },
      { rehydrateAssistantHistory },
      { executeAgentTool },
    ] = await Promise.all([
      import("./persistence.server"),
      import("./read-model.server"),
      import("./tools"),
    ]);
    const rows = await readOwnedAssistantHistory(
      ctx.supabase,
      ctx.userId,
      data.conversationId,
      undefined,
      assistantScopeKey(ctx),
    );
    return rehydrateAssistantHistory(rows, ctx, {
      resolveBot: (id) => import("./bot-config.server").then((m) => m.resolveAgentBot(id, ctx)),
      execute: executeAgentTool,
      audit: (tool, params, summary, duration) =>
        persistAssistantAudit(
          ctx.userId,
          "history",
          data.conversationId,
          tool,
          params,
          summary,
          duration,
          undefined,
          assistantScopeKey(ctx),
        ),
    });
  });

export const getAssistantContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assistantContextInput.parse(value))
  .handler(async ({ data, context }) => {
    const ctx = await callerContext(context.userId);
    const { resolveAgentBots } = await import("./bot-config.server");
    const bots = await resolveAgentBots(ctx);
    if (
      !bots.some(
        (bot) =>
          bot.active &&
          bot.contextKinds.includes(data.kind) &&
          bot.tools.includes("get_record_context"),
      )
    )
      throw new Error("Nenhum agente disponível para este contexto.");
    const [{ executeAgentTool }, { persistAssistantAudit }, { readAssistantRecord }] =
      await Promise.all([
        import("./tools"),
        import("./persistence.server"),
        import("./read-model.server"),
      ]);
    return readAssistantRecord(data, ctx, {
      execute: executeAgentTool,
      audit: (tool, params, summary, duration) =>
        persistAssistantAudit(
          ctx.userId,
          "context",
          null,
          tool,
          params,
          summary,
          duration,
          undefined,
          assistantScopeKey(ctx),
        ),
    });
  });

export const getAssistantBriefing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: AssistantResult[]; generatedAt: string }> => {
    const ctx = await callerContext(context.userId);
    const [
      { executeAgentTool, getAllowedTools },
      { persistAssistantAudit },
      { collectAssistantBriefing },
    ] = await Promise.all([
      import("./tools"),
      import("./persistence.server"),
      import("./read-model.server"),
    ]);
    const { resolveAgentBots } = await import("./bot-config.server");
    const activeTools = new Set(
      (await resolveAgentBots(ctx)).filter((bot) => bot.active).flatMap((bot) => bot.tools),
    );
    const items = await collectAssistantBriefing(
      ctx,
      getAllowedTools(ctx)
        .map((tool) => tool.name)
        .filter((name) => activeTools.has(name)),
      {
        execute: executeAgentTool,
        audit: (tool, params, summary, duration) =>
          persistAssistantAudit(
            ctx.userId,
            "briefing",
            null,
            tool,
            params,
            summary,
            duration,
            undefined,
            assistantScopeKey(ctx),
          ),
      },
    );
    return { items, generatedAt: new Date().toISOString() };
  });
