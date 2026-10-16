import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantPersistence, PendingAction, PendingChoice } from "./chat.server";
import type { AssistantMessage, AssistantResult } from "./stream";
import { maskAgentOutput, maskText } from "./masking";
import { ASSISTANT_HISTORY_TEXT, assistantReferenceParams } from "./scope";

/** Service role is limited to INSERT/UPDATE of assistant bookkeeping here.
 * All reads, including ownership/history, use the user's RLS client. No business
 * table is ever accessed by this module's persistence client. */
async function persistenceWriter() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SupabaseClient<any>;
}
const dbSignal = () => AbortSignal.timeout(8000);
const requireWrite = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error("Não foi possível registrar a consulta do assistente.");
};

export async function readOwnedAssistantHistory(
  client: SupabaseClient<any>,
  userId: string,
  conversationId: string,
  botId?: string,
  scopeKey?: string,
) {
  if (!scopeKey) {
    const scope = await client.rpc("assistant_current_scope");
    if (scope.error || typeof scope.data !== "string")
      throw new Error("Não foi possível validar o acesso à conversa.");
    scopeKey = scope.data;
  }
  let query = client
    .from("assistant_conversations")
    .select("id,bot_id,pending_choice,pending_action")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("scope_key", scopeKey);
  if (botId) query = query.eq("bot_id", botId);
  let { data: conversation, error } = await query.maybeSingle();
  if (error?.message?.includes("pending_")) {
    // Tolerant path until the A_history.sql migration (pending_choice/pending_action) is applied.
    let fallback = client
      .from("assistant_conversations")
      .select("id,bot_id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("scope_key", scopeKey);
    if (botId) fallback = fallback.eq("bot_id", botId);
    ({ data: conversation, error } = await fallback.maybeSingle());
  }
  if (error || !conversation) throw new Error("Conversa não encontrada.");
  const rows = await client
    .from("assistant_messages")
    .select("id,role,content,results,created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(60);
  if (rows.error) throw new Error("Não foi possível carregar o histórico.");
  return {
    messages: maskAgentOutput(
      (rows.data ?? []).reverse().map((row) => ({ ...row, bot_id: conversation.bot_id })),
    ) as AssistantMessage[],
    pending: {
      choice: (maskAgentOutput((conversation as any).pending_choice ?? null) ?? null) as PendingChoice | null,
      action: (maskAgentOutput((conversation as any).pending_action ?? null) ?? null) as PendingAction | null,
    },
  };
}

export async function persistAssistantAudit(
  userId: string,
  botId: string,
  conversationId: string | null,
  tool: string,
  params: unknown,
  summary: Record<string, unknown>,
  durationMs: number,
  signal?: AbortSignal,
  scopeKey?: string,
) {
  if (!scopeKey) throw new Error("Escopo da consulta não validado.");
  const writer = await persistenceWriter();
  requireWrite(
    await writer
      .from("assistant_audit")
      .insert({
        user_id: userId,
        bot_id: botId,
        conversation_id: conversationId,
        scope_key: scopeKey,
        tool,
        params: assistantReferenceParams(params),
        result_summary: maskAgentOutput(summary),
        duration_ms: Math.max(0, Math.round(durationMs)),
      })
      .abortSignal(signal ?? dbSignal()),
  );
}

export async function persistAssistantTurn(options: {
  client: SupabaseClient<any>;
  userId: string;
  botId: string;
  message: string;
  scopeKey: string;
  conversationId?: string;
}): Promise<AssistantPersistence> {
  const { client, userId, botId } = options;
  // Explicit ownership check applies to admins too. Never continue someone else's conversation.
  const history = options.conversationId
    ? await readOwnedAssistantHistory(
        client,
        userId,
        options.conversationId,
        botId,
        options.scopeKey,
      )
    : [];
  const writer = await persistenceWriter();
  const configuredLimit = Number(process.env.ASSISTANT_DAILY_TURNS ?? 80);
  const limit =
    Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 1000
      ? configuredLimit
      : 80;
  const quota = await writer
    .rpc("assistant_take_daily_quota", { p_user_id: userId, p_limit: limit })
    .abortSignal(dbSignal());
  requireWrite(quota);
  if (quota.data !== true)
    throw new Error("Você atingiu o limite de consultas de hoje. Volte amanhã.");
  const conversationId = options.conversationId ?? crypto.randomUUID();
  if (!options.conversationId)
    requireWrite(
      await writer
        .from("assistant_conversations")
        .insert({
          id: conversationId,
          user_id: userId,
          bot_id: botId,
          scope_key: options.scopeKey,
          title: maskText(options.message).slice(0, 90),
        })
        .abortSignal(dbSignal()),
    );
  requireWrite(
    await writer
      .from("assistant_messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: maskText(options.message),
        results: [],
      })
      .abortSignal(dbSignal()),
  );
  return {
    conversationId,
    history: history.map((row) => ({ role: row.role, content: row.content })),
    audit: (tool, params, summary, durationMs, signal) =>
      persistAssistantAudit(
        userId,
        botId,
        conversationId,
        tool,
        params,
        summary,
        durationMs,
        signal,
        options.scopeKey,
      ),
    async saveAssistant(content: string, results: AssistantResult[], signal?: AbortSignal) {
      const cardSummary = results.map((ref) => ({
        tool: ref.tool,
        data: { params: assistantReferenceParams(ref.data.params) },
      }));
      const safeContent = maskText(content).slice(0, 16000) || ASSISTANT_HISTORY_TEXT;
      const insert = await writer
        .from("assistant_messages")
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: safeContent,
          card_summary: cardSummary,
          results: cardSummary,
        })
        .abortSignal(signal ?? dbSignal());
      if (insert.error?.message?.includes("card_summary")) {
        // Tolerant path until the A_history.sql migration (card_summary column) is applied.
        requireWrite(
          await writer
            .from("assistant_messages")
            .insert({
              conversation_id: conversationId,
              user_id: userId,
              role: "assistant",
              content: safeContent,
              results: cardSummary,
            })
            .abortSignal(signal ?? dbSignal()),
        );
      } else {
        requireWrite(insert);
      }
      signal?.throwIfAborted();
      requireWrite(
        await writer
          .from("assistant_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId)
          .eq("user_id", userId)
          .abortSignal(signal ?? dbSignal()),
      );
    },
  };
}
