import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ActionProposal } from "./actions";
const key = z
  .object({ actionId: z.string().uuid(), revision: z.number().int().positive() })
  .strict();
async function actionContext(userId: string, claims: Record<string, unknown>, interactive = true) {
  if (interactive && claims.client_id)
    throw new Error("Confirme a proposta dentro do Gestão, com sua sessão pessoal.");
  const [{ supabaseForUser }, { loadAgentContext }] = await Promise.all([
    import("@/lib/mcp/supabase"),
    import("./security"),
  ]);
  const request = getRequest(),
    token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Sessão inválida.");
  return loadAgentContext(supabaseForUser({ getToken: () => token }), userId, request.signal);
}
export const listAssistantActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ conversationId: z.string().uuid().optional() })
      .strict()
      .parse(v ?? {}),
  )
  .handler(async ({ data, context }): Promise<ActionProposal[]> => {
    const { listActions } = await import("./actions.server");
    return listActions(
      await actionContext(context.userId, context.claims, false),
      data.conversationId,
    );
  });
export const confirmAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => key.parse(v))
  .handler(async ({ data, context }): Promise<ActionProposal> => {
    const { confirmAction } = await import("./actions.server");
    return confirmAction(
      await actionContext(context.userId, context.claims),
      data.actionId,
      data.revision,
    );
  });
export const editAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => key.extend({ payload: z.unknown() }).parse(v))
  .handler(async ({ data, context }): Promise<ActionProposal> => {
    const { editAction } = await import("./actions.server");
    return editAction(
      await actionContext(context.userId, context.claims),
      data.actionId,
      data.revision,
      data.payload,
    );
  });
export const cancelAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => key.parse(v))
  .handler(async ({ data, context }): Promise<ActionProposal> => {
    const { cancelAction } = await import("./actions.server");
    return cancelAction(
      await actionContext(context.userId, context.claims),
      data.actionId,
      data.revision,
    );
  });
