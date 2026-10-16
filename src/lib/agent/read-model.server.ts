import { assistantContextInput } from "./schemas";
import type { AgentContext } from "./security";
import type { AgentToolResult } from "./tools/types";
import type { AssistantMessage, AssistantResult } from "./stream";
import { maskAgentOutput } from "./masking";
import { ASSISTANT_HISTORY_TEXT } from "./scope";
import { assertBotToolScope, getAgentBot } from "./bots";

type ReadDeps = {
  readAction?(ctx: AgentContext, id: string): Promise<unknown>;
  execute(name: string, input: unknown, ctx: AgentContext): Promise<AgentToolResult>;
  audit(
    tool: string,
    params: unknown,
    summary: Record<string, unknown>,
    durationMs: number,
  ): Promise<void>;
};
/** Only references are persisted. Reopening a conversation queries current RLS,
 * so a reassigned record or revoked role can never replay an old snapshot. */
export async function rehydrateAssistantHistory(
  rows: AssistantMessage[],
  ctx: AgentContext,
  deps: ReadDeps,
): Promise<AssistantMessage[]> {
  let remaining = 8;
  const output = rows.map((row) => ({ ...row, results: [] as AssistantResult[] }));
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (row.role !== "assistant") continue;
    output[index].content = ASSISTANT_HISTORY_TEXT;
    for (const ref of row.results) {
      if (remaining <= 0) {
        output[index].results.push({
          tool: ref.tool,
          data: {
            status: "refresh_required",
            message: "Faça uma nova consulta para atualizar este resultado.",
          },
        });
        continue;
      }
      remaining--;
      const started = Date.now();
      try {
        const params = ref.data?.params;
        if (!params || typeof params !== "object" || Array.isArray(params))
          throw new Error("invalid_reference");
        const bot = getAgentBot(row.bot_id ?? "");
        if (!bot) throw new Error("invalid_bot_reference");
        assertBotToolScope(bot, ref.tool, params);
        // Never replay preparation: that would create new proposals merely by
        // reopening history. Actions keep only their opaque ID and are reread.
        if (ref.tool.startsWith("prepare_")) {
          const id = (params as Record<string, unknown>).actionId;
          if (
            typeof id === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          ) {
            const readAction =
              deps.readAction ?? (await import("./actions.server")).readAssistantAction;
            const action = await readAction(ctx, id);
            output[index].results.push({
              tool: ref.tool,
              data: { action: maskAgentOutput(action) },
            });
          } else {
            output[index].results.push({
              tool: ref.tool,
              data: {
                status: "refresh_required",
                message: "Consulte Rotinas e Preferências para ver o estado atual desta proposta.",
              },
            });
          }
          continue;
        }
        const result = await deps.execute(ref.tool, params, ctx);
        await deps.audit(ref.tool, {}, { status: "refreshed" }, Date.now() - started);
        output[index].results.push({
          tool: ref.tool,
          data: maskAgentOutput(result.structuredContent),
        });
      } catch {
        output[index].results.push({
          tool: ref.tool,
          data: {
            status: "unavailable",
            message: "Não encontrei este resultado nos dados que você pode acessar agora.",
          },
        });
      }
    }
  }
  return output;
}
export async function readAssistantRecord(
  input: unknown,
  ctx: AgentContext,
  deps: ReadDeps,
): Promise<Record<string, any>> {
  const params = assistantContextInput.parse(input);
  const started = Date.now();
  const result = await deps.execute("get_record_context", params, ctx);
  await deps.audit(
    "get_record_context",
    params,
    { status: "ok", found: Boolean(result.structuredContent.record) },
    Date.now() - started,
  );
  return maskAgentOutput(result.structuredContent);
}

/** Each tool has its own closed schema; agenda_today intentionally has no limit. */
export async function collectAssistantBriefing(
  ctx: AgentContext,
  allowedTools: readonly string[],
  deps: ReadDeps,
): Promise<AssistantResult[]> {
  const specs: Array<{ tool: string; params: Record<string, unknown> }> = [
    { tool: "agenda_today", params: {} },
    { tool: "stale_attendances", params: { limit: 5 } },
    { tool: "expiring_agenciamentos", params: { limit: 5 } },
    { tool: "rentals_overdue", params: { limit: 5 } },
  ];
  return Promise.all(
    specs
      .filter(({ tool }) => allowedTools.includes(tool))
      .map(async ({ tool, params }) => {
        const started = Date.now();
        try {
          const result = await deps.execute(tool, params, ctx);
          await deps.audit(tool, params, { status: "ok" }, Date.now() - started);
          return { tool, data: maskAgentOutput(result.structuredContent) };
        } catch {
          return {
            tool,
            data: { status: "unavailable", message: "Não foi possível consultar este resumo." },
          };
        }
      }),
  );
}
