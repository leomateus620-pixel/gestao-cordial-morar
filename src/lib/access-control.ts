// Centralized RBAC helpers. Keep every role check going through this file
// so we do not scatter session.perfil === "admin_owner" across the codebase.

import type { MockUser } from "@/lib/auth-mock";
import {
  roleDefinitions,
  type AppModule,
  type UserProfile,
} from "@/lib/mock/permissions";

type SessionLike = Pick<MockUser, "perfil" | "modules"> | null | undefined;

export function isAdminUser(session: SessionLike): boolean {
  return session?.perfil === "admin_owner";
}

/**
 * Financial insights (aggregate revenue, ticket médio, CPL, ROI, previsões, comissões).
 * Owner + financeiro_admin. Never expose to corretor / secretaria.
 */
export function canSeeFinancialInsights(session: SessionLike): boolean {
  return session?.perfil === "admin_owner" || session?.perfil === "financeiro_admin";
}

/**
 * Executive / admin-only insights (rankings, performance, validation controls).
 * Owner-only.
 */
export function canSeeAdminInsights(session: SessionLike): boolean {
  return session?.perfil === "admin_owner";
}

export function getAllowedModulesForProfile(profile: UserProfile | undefined): AppModule[] {
  if (!profile) return [];
  return roleDefinitions[profile]?.modules ?? [];
}

export function canAccessModule(session: SessionLike, module: AppModule): boolean {
  if (!session) return false;
  if (isAdminUser(session)) return true;
  const allowed = getAllowedModulesForProfile(session.perfil);
  return allowed.includes(module);
}

/**
 * Modules that must appear on the mobile bottom navigation. Admin keeps the
 * broader default; operational roles get a curated 4-item list plus "Mais".
 */
export function getPrimaryMobileModulesForProfile(profile: UserProfile | undefined): AppModule[] {
  switch (profile) {
    case "corretor":
      return ["dashboard", "atendimentos", "clientes", "agenciamentos"];
    case "secretaria":
      return ["dashboard", "atendimentos", "clientes", "agenciamentos"];
    default:
      return ["dashboard", "atendimentos", "imoveis", "agenda"];
  }
}
