import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const beginAssistantDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { beginDelegation } = await import("./delegation.server");
    return beginDelegation(context.userId);
  });
export const getAssistantReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ loadAgentContext }, { assistantReadiness }] = await Promise.all([
      import("./security"),
      import("./readiness.server"),
    ]);
    return assistantReadiness(await loadAgentContext(context.supabase, context.userId));
  });
export const revokeAssistantDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ confirmed: z.literal(true) })
      .strict()
      .parse(v),
  )
  .handler(async ({ context }) => {
    const result = await context.supabase.rpc("assistant_delegation_revoke" as never);
    if (result.error) throw new Error("Não foi possível desconectar a autorização.");
    const { getRequest } = await import("@tanstack/react-start/server");
    const clientId = process.env.ASSISTANT_OAUTH_CLIENT_ID;
    let remoteRevoked = false;
    if (clientId && process.env.SUPABASE_URL) {
      try {
        const url = new URL(`${process.env.SUPABASE_URL}/auth/v1/user/oauth/grants`);
        url.searchParams.set("client_id", clientId);
        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: getRequest().headers.get("authorization") ?? "",
            apikey:
              process.env.SUPABASE_PUBLISHABLE_KEY ??
              process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
              "",
          },
          signal: AbortSignal.timeout(10000),
        });
        remoteRevoked = response.ok;
      } catch {
        remoteRevoked = false;
      }
    }
    return { revoked: true, remoteRevoked };
  });

export const getAssistantOAuthClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ clientId: process.env.ASSISTANT_OAUTH_CLIENT_ID ?? null }));
