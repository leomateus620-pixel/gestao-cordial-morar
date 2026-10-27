import type { SupabaseClient } from "@supabase/supabase-js";
import { AdProviderError } from "./types";
export type AdsContext = { supabase: SupabaseClient; userId: string };
export async function requireAdsAdmin(ctx: AdsContext) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new AdProviderError("no_permission", "Apenas administrador.");
}
export async function requireMarketingAccess(ctx: AdsContext, agency?: string) {
  const roles = await Promise.all(
    ["admin", "financeiro", "secretaria", "meta_reviewer"].map(async (role) => {
      const { data, error } = await ctx.supabase.rpc("has_role", {
        _user_id: ctx.userId,
        _role: role,
      });
      if (error)
        throw new AdProviderError("no_permission", "Não foi possível validar os papéis de acesso.");
      return data === true;
    }),
  );
  if (!roles[0] && !roles[3] && (roles[1] || !roles[2]))
    throw new AdProviderError("no_permission", "Sem acesso ao marketing.");
  if (agency && !roles[0]) {
    const { data, error } = await ctx.supabase.rpc("marketing_can_operate", { p_agency: agency });
    if (error || data !== true)
      throw new AdProviderError("no_permission", "Sem acesso a esta imobiliária.");
  }
}

/** Admin or the external Meta review account (read-only views). */
export async function isAdsAdminOrReviewer(ctx: AdsContext): Promise<boolean> {
  for (const role of ["admin", "meta_reviewer"]) {
    const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (error) throw new AdProviderError("no_permission", "Não foi possível validar o acesso.");
    if (data === true) return true;
  }
  return false;
}
