import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  botConfigInput,
  botConfigReset,
  mcpClientInput,
  type AssistantAdminConfigDTO,
  type PublicAgentBot,
} from "./bot-config.schemas";
async function personal(context: {
  supabase: any;
  userId: string;
  claims: Record<string, unknown>;
}) {
  const [{ loadAgentContext }, { assertPersonalAdmin }] = await Promise.all([
    import("./security"),
    import("./bot-config.server"),
  ]);
  const ctx = await loadAgentContext(context.supabase, context.userId);
  assertPersonalAdmin(ctx, context.claims);
  return ctx;
}
function check(error: { message: string } | null) {
  if (error)
    throw new Error(
      error.message.includes("stale_revision")
        ? "A configuração mudou. Recarregue antes de salvar."
        : "Não foi possível salvar a configuração da equipe.",
    );
}
export const getAssistantCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublicAgentBot[]> => {
    const [{ loadAgentContext }, { publicAgentCatalog }] = await Promise.all([
      import("./security"),
      import("./bot-config.server"),
    ]);
    return publicAgentCatalog(await loadAgentContext(context.supabase, context.userId));
  });
export const adminListAssistantBotConfigs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssistantAdminConfigDTO> => {
    const ctx = await personal(context);
    return (await import("./bot-config.server")).adminConfigOverview(ctx, context.claims);
  });
export const adminSaveAssistantBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => botConfigInput.parse(v))
  .handler(async ({ context, data }): Promise<AssistantAdminConfigDTO> => {
    const ctx = await personal(context),
      { maskText } = await import("./masking");
    const { error } = await ctx.supabase.rpc("assistant_bot_config_save", {
      _bot_id: data.id,
      _revision: data.expectedRevision,
      _enabled: data.enabled,
      _instructions: maskText(data.instructions),
      _suggestions: data.suggestions.map(maskText),
      _confirmed: data.confirmed,
    });
    check(error);
    return (await import("./bot-config.server")).adminConfigOverview(ctx, context.claims);
  });
export const adminResetAssistantBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => botConfigReset.parse(v))
  .handler(async ({ context, data }): Promise<AssistantAdminConfigDTO> => {
    const ctx = await personal(context);
    const { error } = await ctx.supabase.rpc("assistant_bot_config_save", {
      _bot_id: data.id,
      _revision: data.expectedRevision,
      _enabled: true,
      _instructions: "",
      _suggestions: null,
      _confirmed: data.confirmed,
    });
    check(error);
    return (await import("./bot-config.server")).adminConfigOverview(ctx, context.claims);
  });
export const adminSetAssistantMcpClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => mcpClientInput.parse(v))
  .handler(async ({ context, data }): Promise<AssistantAdminConfigDTO> => {
    const ctx = await personal(context),
      { maskText } = await import("./masking");
    let name = data.name;
    if (data.approved) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const response = await supabaseAdmin.auth.admin.oauth.getClient(data.clientId);
      const metadata = (await import("./bot-config.server")).oauthClientMetadata(response.data);
      if (response.error || !metadata || metadata.clientId !== data.clientId)
        throw new Error(
          "Não encontrei este cliente OAuth registrado. Confira o aplicativo antes de aprovar.",
        );
      name = metadata.name;
    }
    const { error } = await ctx.supabase.rpc("assistant_mcp_client_set", {
      _client_id: data.clientId,
      _name: maskText(name),
      _approved: data.approved,
      _revision: data.expectedRevision,
      _confirmed: data.confirmed,
    });
    check(error);
    return (await import("./bot-config.server")).adminConfigOverview(ctx, context.claims);
  });
