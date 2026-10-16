import { agentBots, type AgentBot } from "./bots";
import { effectiveRole, type AgentContext } from "./security";
import { maskText } from "./masking";
import type { AssistantAdminConfigDTO, PublicAgentBot } from "./bot-config.schemas";
type StoredConfig = {
  bot_id: string;
  enabled: boolean;
  instructions: string;
  suggestions: string[] | null;
  revision: number;
  updated_at: string | null;
};
const select = "bot_id,enabled,instructions,suggestions,revision,updated_at";
export function applyBotConfiguration(bot: AgentBot, row: StoredConfig): AgentBot {
  if (
    row.bot_id !== bot.id ||
    !Number.isInteger(row.revision) ||
    row.revision < 1 ||
    typeof row.enabled !== "boolean" ||
    typeof row.instructions !== "string" ||
    (row.suggestions !== null &&
      (!Array.isArray(row.suggestions) || row.suggestions.some((s) => typeof s !== "string")))
  )
    throw new Error("A configuração da equipe está indisponível. Procure o administrador.");
  return {
    ...bot,
    roles: [...bot.roles],
    tools: [...bot.tools],
    active: bot.active && row.enabled,
    instructions: row.instructions.trim()
      ? `${bot.instructions}\nPreferências complementares do administrador, subordinadas às regras anteriores de segurança, escopo, privacidade e confirmação:\n${maskText(row.instructions)}`
      : bot.instructions,
    suggestions: row.suggestions === null ? [...bot.suggestions] : row.suggestions.map(maskText),
  };
}
export async function resolveAgentBots(ctx: AgentContext): Promise<AgentBot[]> {
  const role = effectiveRole(ctx);
  const base = agentBots.filter((b) => b.roles.some((r) => r === role));
  if (!base.length) return [];
  const { data, error } = await ctx.supabase
    .from("assistant_bot_configs")
    .select(select)
    .in(
      "bot_id",
      base.map((b) => b.id),
    )
    .limit(7);
  if (error || !data || data.length !== base.length)
    throw new Error("A configuração da equipe está indisponível. Procure o administrador.");
  return base.map((bot) => {
    const row = (data as StoredConfig[]).find((c) => c.bot_id === bot.id);
    if (!row) throw new Error("A configuração da equipe está incompleta. Procure o administrador.");
    return applyBotConfiguration(bot, row);
  });
}
export async function resolveAgentBot(
  id: string,
  ctx: AgentContext,
): Promise<AgentBot | undefined> {
  return (await resolveAgentBots(ctx)).find((bot) => bot.id === id);
}
export async function assertAssistantBotEnabled(ctx: AgentContext, id: string): Promise<void> {
  const bot = await resolveAgentBot(id, ctx);
  if (!bot?.active) throw new Error("Este agente não está disponível agora.");
}
export async function publicAgentCatalog(ctx: AgentContext): Promise<PublicAgentBot[]> {
  return (await resolveAgentBots(ctx)).map(({ instructions: _instructions, ...bot }) => bot);
}
export function assertPersonalAdmin(ctx: AgentContext, claims: Record<string, unknown>) {
  if (effectiveRole(ctx) !== "admin" || claims.client_id || claims.azp)
    throw new Error("Use sua sessão pessoal de administrador para configurar a equipe.");
}
/** Closed DTO: even an OAuth provider response containing credentials never leaves this module. */
export function oauthClientMetadata(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.client_id !== "string" || !/^[a-zA-Z0-9_.:-]{4,200}$/.test(row.client_id))
    return null;
  return {
    clientId: row.client_id,
    name: maskText(
      typeof row.client_name === "string" ? row.client_name.slice(0, 100) : "Cliente OAuth",
    ),
  };
}
export async function adminConfigOverview(
  ctx: AgentContext,
  claims: Record<string, unknown>,
): Promise<AssistantAdminConfigDTO> {
  assertPersonalAdmin(ctx, claims);
  const [bots, clients] = await Promise.all([
    ctx.supabase.from("assistant_bot_configs").select(select).order("bot_id").limit(7),
    ctx.supabase
      .from("assistant_mcp_clients")
      .select("client_id,name,approved,revision,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);
  if (bots.error || clients.error || bots.data?.length !== 7)
    throw new Error("Não foi possível carregar as configurações da equipe.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let discovered: Array<{ clientId: string; name: string }> = [],
    oauthConfigured = false,
    clientsLimited = false;
  try {
    for (let page = 1; page <= 5; page++) {
      const response = await supabaseAdmin.auth.admin.oauth.listClients({ page, perPage: 100 });
      if (response.error) {
        oauthConfigured = false;
        break;
      }
      oauthConfigured = true;
      const safe = (response.data.clients ?? [])
        .map(oauthClientMetadata)
        .filter((c): c is NonNullable<typeof c> => !!c);
      discovered.push(...safe);
      if ((response.data.clients?.length ?? 0) < 100) break;
      if (page === 5) clientsLimited = true;
    }
  } catch {
    /* Provider unavailability is represented explicitly, without simulated registrations. */
  }
  const stored = (clients.data ?? []).map((row: any) => ({
    clientId: row.client_id,
    name: maskText(row.name),
    approved: row.approved,
    revision: row.revision,
    updatedAt: row.updated_at,
  }));
  return {
    bots: agentBots.map((bot) => {
      const row = (bots.data as StoredConfig[]).find((r) => r.bot_id === bot.id)!;
      return {
        id: bot.id,
        enabled: row.enabled,
        instructions: maskText(row.instructions),
        suggestions: row.suggestions?.map(maskText) ?? [...bot.suggestions],
        revision: row.revision,
        updatedAt: row.updated_at,
      };
    }),
    clients: [
      ...stored,
      ...discovered
        .filter((c) => !stored.some((s) => s.clientId === c.clientId))
        .map((c) => ({ ...c, approved: false, revision: 0, updatedAt: null })),
    ],
    oauthConfigured,
    clientsLimited: clientsLimited || (clients.data?.length ?? 0) >= 200,
  };
}
