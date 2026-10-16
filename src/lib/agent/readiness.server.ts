import type { AgentContext } from "./security";
import { oauthConfiguration } from "./delegation.server";
export async function assistantReadiness(ctx: AgentContext) {
  let configurationReady = false;
  try {
    await (await import("./bot-config.server")).resolveAgentBots(ctx);
    configurationReady = true;
  } catch {
    /* No fallback to code defaults when the configuration schema is absent. */
  }
  const config = await oauthConfiguration();
  const missing = ["ASSISTANT_PUBLIC_ORIGIN", "ASSISTANT_OAUTH_CLIENT_ID", "SUPABASE_URL"].filter(
    (key) => !process.env[key],
  );
  if (!config.clientSecret) missing.push("vault:assistant_oauth_client_secret");
  if (!config.configured && !missing.length) missing.push("ASSISTANT_PUBLIC_ORIGIN");
  if (!configurationReady) missing.push("migration:assistant_bot_configs");
  const result = await ctx.supabase
    .from("assistant_delegations")
    .select("status,updated_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (result.error) throw new Error("Não foi possível consultar a autorização de rotinas.");
  const delegation =
    result.data?.status === "connected"
      ? ("connected" as const)
      : result.data?.status === "revoked"
        ? ("revoked" as const)
        : ("missing" as const);
  const database = await (ctx.supabase as any)
    .from("assistant_routines")
    .select("id")
    .eq("user_id", ctx.userId)
    .limit(1);
  const scheduler = await (await import("./delegation.server"))
    .adminBookkeeping()
    .rpc("assistant_routine_scheduler_status");
  return {
    status:
      !config.configured || !!database.error || !configurationReady
        ? ("not_configured" as const)
        : delegation === "connected"
          ? ("ready" as const)
          : ("needs_reauthorization" as const),
    delegation,
    schedulerEnabled:
      process.env.ASSISTANT_ROUTINES_ENABLED === "true" &&
      !scheduler.error &&
      scheduler.data === true,
    missing: ctx.roles.includes("admin") ? missing : [],
    database: { status: database.error ? ("not_configured" as const) : ("ready" as const) },
    configuration: {
      status: configurationReady ? ("ready" as const) : ("not_configured" as const),
    },
    mcp: {
      reviewOriginConfigured: /^https:\/\/[^/?#]+\/?$/.test(
        process.env.ASSISTANT_PUBLIC_ORIGIN ?? "",
      ),
    },
    gateway: {
      status: process.env.LOVABLE_API_KEY ? ("configured" as const) : ("not_configured" as const),
    },
    research: {
      status: process.env.TAVILY_API_KEY ? ("configured" as const) : ("not_configured" as const),
    },
  };
}
