import type { SupabaseClient } from "@supabase/supabase-js";
import { AdProviderError } from "./types";

export type AdsContext = { supabase: SupabaseClient; userId: string };
export type MarketingAction =
  | "read_metrics"
  | "read_ad_budget"
  | "read_lead_contacts"
  | "manage_leads"
  | "create_draft"
  | "send_paused"
  | "change_budget"
  | "set_delivery"
  | "generate_report"
  | "financial_report"
  | "manage_connection"
  | "manage_manual";
export type MarketingAccess = { isAdmin: boolean; isReviewer: boolean; financialVisible: boolean };

/** Deny wins, including an accidentally combined reviewer + administrator account. */
export function marketingRoleAllows(roles: ReadonlySet<string>, action: MarketingAction): boolean {
  if (roles.has("meta_reviewer")) return action === "read_metrics";
  if (roles.has("admin")) return true;
  if (roles.has("financeiro") || !roles.has("secretaria")) return false;
  return [
    "read_metrics",
    "read_lead_contacts",
    "manage_leads",
    "create_draft",
    "generate_report",
    "manage_manual",
  ].includes(action);
}
export async function marketingAccess(
  ctx: AdsContext,
  action: MarketingAction = "read_metrics",
): Promise<MarketingAccess> {
  const results = await Promise.all(
    ["admin", "financeiro", "secretaria", "meta_reviewer"].map(async (role) => {
      const { data, error } = await ctx.supabase.rpc("has_role", {
        _user_id: ctx.userId,
        _role: role,
      });
      if (error)
        throw new AdProviderError("no_permission", "Não foi possível validar os papéis de acesso.");
      return data === true ? role : null;
    }),
  );
  const roles = new Set(results.filter((role): role is string => role !== null));
  if (!marketingRoleAllows(roles, action)) {
    // Named business grants extend only Meta management. Reviewer/finance dominance
    // is checked before SQL, including accidentally combined roles.
    if (
      roles.has("meta_reviewer") ||
      roles.has("financeiro") ||
      !roles.has("secretaria") ||
      !["read_ad_budget", "send_paused", "change_budget", "set_delivery"].includes(action)
    )
      throw new AdProviderError("no_permission", "Ação não permitida para este perfil.");
    const { data, error } = await ctx.supabase.rpc("marketing_can_act", {
      p_action: action,
      p_agency: null,
    });
    if (error || data !== true)
      throw new AdProviderError("no_permission", "Ação não permitida para este perfil.");
  }
  const isReviewer = roles.has("meta_reviewer");
  return {
    isAdmin: roles.has("admin") && !isReviewer,
    isReviewer,
    financialVisible: roles.has("admin") && !isReviewer,
  };
}

/** Authenticate the action before resolving any privileged data; scope again after reading its ID. */
export async function requireMarketingAction(
  ctx: AdsContext,
  action: MarketingAction,
  agency?: string | null,
) {
  const access = await marketingAccess(ctx, action);
  if (agency) {
    if (!["cordial", "morar"].includes(agency))
      throw new AdProviderError("no_permission", "Imobiliária inválida.");
    const { data, error } = await ctx.supabase.rpc("marketing_can_act", {
      p_action: action,
      p_agency: agency,
    });
    if (error || data !== true)
      throw new AdProviderError("no_permission", "Sem acesso a esta imobiliária.");
  }
  return access;
}
export async function requireAdsAdmin(ctx: AdsContext) {
  await requireMarketingAction(ctx, "manage_connection");
}
export async function requireMarketingAccess(ctx: AdsContext, agency?: string) {
  await requireMarketingAction(ctx, "read_metrics", agency);
}

/** Only sanitized reads; this helper must never authorize a mutation or lead contact. */
export async function isAdsAdminOrReviewer(ctx: AdsContext): Promise<boolean> {
  const access = await marketingAccess(ctx);
  return access.isAdmin || access.isReviewer;
}
