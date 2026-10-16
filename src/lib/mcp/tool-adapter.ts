import {
  defineTool,
  ToolError,
  type ToolContext,
  type ToolHandlerResult,
} from "@lovable.dev/mcp-js";
import { agentTools, executeAgentTool, loadAgentContext } from "../agent/tools";
import { supabaseForUser } from "./supabase";
/** OAuth transport adapter only. Business behavior lives in the shared agent registry. */
export function mcpTool(name: string) {
  const tool = agentTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown registered MCP tool: ${name}`);
  return defineTool({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema.shape,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (
      input: Record<string, unknown> | undefined,
      ctx: ToolContext,
    ): Promise<ToolHandlerResult> => {
      if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
      const userId = ctx.getUserId();
      if (!userId) throw new ToolError("Sessão inválida. Entre novamente.");
      try {
        const context = await loadAgentContext(supabaseForUser(ctx), userId);
        const output = await executeAgentTool(name, input, context);
        return {
          content: output.content,
          structuredContent: JSON.parse(JSON.stringify(output.structuredContent)),
        };
      } catch {
        throw new ToolError(
          "Não foi possível concluir esta consulta com as suas permissões atuais.",
        );
      }
    },
  });
}
