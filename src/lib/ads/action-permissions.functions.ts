import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMarketingAction, type MarketingAction } from "./authorization.server";

export type MarketingActionPermissions = Record<
  "cordial" | "morar",
  Record<MarketingAction, boolean>
>;
export const getMarketingActionPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketingActionPermissions> => {
    await requireMarketingAction(context, "read_metrics");
    const { data, error } = await (context.supabase as SupabaseClient).rpc(
      "marketing_action_permissions",
    );
    if (error || !data) throw new Error("Não foi possível validar as ações disponíveis.");
    return data as MarketingActionPermissions;
  });
