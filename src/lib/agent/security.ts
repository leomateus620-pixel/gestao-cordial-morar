import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentRole = "admin" | "secretaria" | "corretor" | "financeiro";
export interface AgentContext {
  supabase: SupabaseClient<any>;
  userId: string;
  roles: string[];
  agencies: string[];
  signal?: AbortSignal;
}
export class AgentAccessError extends Error {
  constructor(message = "Você não tem permissão para esta consulta.") {
    super(message);
    this.name = "AgentAccessError";
  }
}
const roleOrder: AgentRole[] = ["admin", "financeiro", "secretaria", "corretor"];
export const operationalRoles: AgentRole[] = ["admin", "secretaria", "corretor"];
export function effectiveRole(ctx: AgentContext): AgentRole | undefined {
  return roleOrder.find((role) => ctx.roles.includes(role));
}
export function isOperationalManager(ctx: AgentContext): boolean {
  const role = effectiveRole(ctx);
  return role === "admin" || role === "secretaria";
}
export function canSeeFinancialValues(ctx: AgentContext): boolean {
  const role = effectiveRole(ctx);
  return role === "admin" || role === "financeiro";
}
export function assertAgentRole(ctx: AgentContext, roles: readonly AgentRole[]): void {
  if (!ctx.userId || !roles.includes(effectiveRole(ctx) as AgentRole)) throw new AgentAccessError();
  ctx.signal?.throwIfAborted();
}
/** The supplied client must be created with the caller's bearer token; never an admin client. */
export async function loadAgentContext(
  supabase: SupabaseClient<any>,
  userId: string,
  signal?: AbortSignal,
): Promise<AgentContext> {
  signal?.throwIfAborted();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== userId)
    throw new AgentAccessError("Sessão inválida. Entre novamente.");
  const [roles, agencies] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("user_agencies").select("agency").eq("user_id", userId),
  ]);
  if (roles.error || agencies.error)
    throw new AgentAccessError("Não foi possível validar suas permissões.");
  const ctx: AgentContext = {
    supabase,
    userId,
    signal,
    roles: (roles.data ?? [])
      .map((r) => String(r.role))
      .filter((r) => roleOrder.includes(r as AgentRole)),
    agencies: [
      ...new Set(
        (agencies.data ?? [])
          .map((r) => String(r.agency))
          .filter((a) => a === "cordial" || a === "morar"),
      ),
    ],
  };
  if (!effectiveRole(ctx)) throw new AgentAccessError();
  return ctx;
}
/** Defense in depth for tables whose historic RLS is broader than the agent's agency scope. */
export function scopeAgency(
  query: any,
  ctx: AgentContext,
  column: string,
  includeBoth = true,
): any {
  if (effectiveRole(ctx) === "admin") return query;
  const agencies = ctx.agencies.filter((a) => a === "cordial" || a === "morar");
  return query.in(
    column,
    agencies.length ? [...new Set([...agencies, ...(includeBoth ? ["ambas"] : [])])] : [],
  );
}
export function scopeOwned(query: any, ctx: AgentContext, ownerColumn: string): any {
  if (isOperationalManager(ctx)) return query;
  return query.or(`created_by.eq.${ctx.userId},${ownerColumn}.eq.${ctx.userId}`);
}
