import {
  defineTool,
  ToolError,
  type CreateAppContextInput,
  type ToolContext,
  type ToolHandlerResult,
} from "@lovable.dev/mcp-js";
import { z } from "zod";
import { maskText } from "../agent/masking";
import { agentTools, loadAgentContext } from "../agent/tools";
import { supabaseForUser } from "./supabase";
import type { AgentContext } from "../agent/security";
import type { AgentBot } from "../agent/bots";
import {
  externalActionTypes,
  externalIdentity,
  externalPermission,
  type ExternalIdentity,
  type ExternalPrepareTool,
} from "../agent/external-actions.server";

export type McpAppContext = {
  context?: AgentContext;
  identity?: ExternalIdentity;
  allowedPrepareTools: readonly string[];
  canReadExternalActions: boolean;
};
/** Server registry and caller-token lookups decide visibility, never model arguments. */
export async function createMcpAppContext({
  auth,
  signal,
}: CreateAppContextInput): Promise<McpAppContext> {
  const denied: McpAppContext = { allowedPrepareTools: [], canReadExternalActions: false };
  let identity: ExternalIdentity;
  try {
    identity = externalIdentity(auth);
  } catch {
    return denied;
  }
  const context = await loadAgentContext(supabaseForUser(auth), identity.userId, signal);
  return externalCatalogContext(context, identity);
}
/** A missing phase-4 configuration disables proposals without breaking legacy read discovery. */
export async function externalCatalogContext(
  context: AgentContext,
  identity: ExternalIdentity,
  loadBots: (ctx: AgentContext) => Promise<AgentBot[]> = async (ctx) =>
    (await import("../agent/bot-config.server")).resolveAgentBots(ctx),
): Promise<McpAppContext> {
  const denied: McpAppContext = { allowedPrepareTools: [], canReadExternalActions: false };
  try {
    await externalPermission(context, identity);
  } catch {
    return denied;
  }
  try {
    const bots = await loadBots(context);
    const enabled = new Set(bots.filter((bot) => bot.active).flatMap((bot) => bot.tools));
    const allowedPrepareTools = Object.keys(externalActionTypes).filter((name) =>
      enabled.has(name),
    );
    return { context, identity, allowedPrepareTools, canReadExternalActions: true };
  } catch {
    return denied;
  }
}
export type ExternalMcpServices = {
  prepare: (
    ctx: AgentContext,
    identity: ExternalIdentity,
    name: ExternalPrepareTool,
    input: unknown,
  ) => Promise<unknown>;
  status: (ctx: AgentContext, identity: ExternalIdentity, id: string) => Promise<unknown>;
};
const defaults: ExternalMcpServices = {
  async prepare(...args) {
    return (await import("../agent/external-actions.server")).prepareExternalAction(...args);
  },
  async status(...args) {
    return (await import("../agent/external-actions.server")).getExternalActionStatus(...args);
  },
};
const toolWithContext = defineTool.withAppContext<McpAppContext>();
function currentCaller(ctx: ToolContext<McpAppContext>) {
  const identity = externalIdentity(ctx);
  const context = ctx.appContext.context;
  if (
    !context ||
    context.userId !== identity.userId ||
    ctx.appContext.identity?.clientId !== identity.clientId
  )
    throw new ToolError("Este aplicativo não está autorizado a preparar propostas.");
  return { identity, context: { ...context, signal: ctx.signal } };
}
/** Only known application errors cross the MCP boundary, always redacted. */
export function safeExternalToolError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const known =
    /^(A preparação externa exige|Este aplicativo não está autorizado|Este agente não está disponível|Não encontrei|Esta solicitação já foi usada|Esta proposta pertence|O endereço público do Gestão|Não foi possível (consultar|preparar|atualizar)|Sessão inválida)/.test(
      message,
    );
  return known
    ? maskText(message)
        .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, "")
        .replace(/<[^>]*>/g, "")
        .slice(0, 300)
    : fallback;
}
export function externalProposalNotice(result: unknown): string {
  const row =
    result && typeof result === "object"
      ? (result as { action?: { status?: unknown }; expired?: unknown })
      : undefined;
  const status = row?.action?.status;
  if (status === "pending" && row?.expired === true)
    return "A proposta expirou. Prepare uma nova solicitação para revisar dados atuais.";
  if (status === "pending")
    return "Proposta pendente. Revise no Gestão e confirme com sua sessão pessoal. Nada será executado por MCP.";
  if (status === "executed")
    return "Esta proposta já foi executada. Consulte o resultado no Gestão.";
  if (status === "cancelled")
    return "Esta proposta foi cancelada. Para continuar, prepare uma nova solicitação.";
  if (status === "failed")
    return "Esta proposta falhou. Consulte o estado no Gestão antes de preparar outra.";
  return "Consulte o estado atual da proposta no Gestão. A confirmação acontece somente na sua sessão pessoal.";
}
export function externalMcpPrepareTool(
  name: ExternalPrepareTool,
  services: ExternalMcpServices = defaults,
) {
  const tool = agentTools.find((registered) => registered.name === name);
  if (!tool) throw new Error(`Unknown registered proposal tool: ${name}`);
  return toolWithContext({
    name,
    title: tool.title,
    description: `${tool.description} Reutilize requestId ao repetir a mesma solicitação; confirme somente no Gestão pelo link retornado.`,
    inputSchema: { ...tool.inputSchema.shape, requestId: z.string().uuid() },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    enabled: ({ appContext }) => appContext.allowedPrepareTools.includes(name),
    async handler(
      input: Record<string, unknown> | undefined,
      ctx: ToolContext<McpAppContext>,
    ): Promise<ToolHandlerResult> {
      try {
        const { identity, context } = currentCaller(ctx);
        // Recheck current approval even if discovery or app context was cached by a remote client.
        await externalPermission(context, identity);
        const { requestId, ...payload } = input ?? {};
        const result = await services.prepare(context, identity, name, { requestId, payload });
        return {
          content: [
            {
              type: "text",
              text: externalProposalNotice(result),
            },
          ],
          structuredContent: JSON.parse(JSON.stringify(result)),
        };
      } catch (error) {
        throw new ToolError(
          safeExternalToolError(
            error,
            "Não foi possível preparar esta proposta com seu acesso atual.",
          ),
        );
      }
    },
  });
}
export function externalMcpStatusTool(services: ExternalMcpServices = defaults) {
  return toolWithContext({
    name: "get_action_status",
    title: "Consultar proposta deste aplicativo",
    description:
      "Consulta uma proposta preparada por este aplicativo e usuário. Não confirma, edita, cancela nem executa.",
    inputSchema: { actionId: z.string().uuid() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    enabled: ({ appContext }) => appContext.canReadExternalActions,
    async handler({ actionId }, ctx) {
      try {
        const { identity, context } = currentCaller(ctx);
        await externalPermission(context, identity);
        const result = await services.status(context, identity, actionId);
        return {
          content: [
            {
              type: "text",
              text: externalProposalNotice(result),
            },
          ],
          structuredContent: JSON.parse(JSON.stringify(result)),
        };
      } catch (error) {
        throw new ToolError(
          safeExternalToolError(error, "Não encontrei esta proposta no seu acesso atual."),
        );
      }
    },
  });
}
export function externalMcpTools(services: ExternalMcpServices = defaults) {
  return [
    ...(Object.keys(externalActionTypes) as ExternalPrepareTool[]).map((name) =>
      externalMcpPrepareTool(name, services),
    ),
    externalMcpStatusTool(services),
  ];
}
