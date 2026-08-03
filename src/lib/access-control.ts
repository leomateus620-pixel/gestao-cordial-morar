// Centralized RBAC helpers. Keep every role check going through this file
// so we do not scatter session.perfil === "admin_owner" across the codebase.

import type { MockUser } from "@/lib/auth-mock";
// Import relativo para permitir execução direta em `node --test`.
import { roleDefinitions, type AppModule, type UserProfile } from "./mock/permissions.ts";

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

export function canManageAttendanceAssignments(session: SessionLike): boolean {
  return session?.perfil === "admin_owner" || session?.perfil === "secretaria";
}

/**
 * Operational response-time metrics are intentionally narrower than financial
 * insights. Brokers and finance roles must never receive first-open timing.
 */
export function canSeeNotificationMetrics(session: SessionLike): boolean {
  return session?.perfil === "admin_owner" || session?.perfil === "secretaria";
}

/**
 * Mensagem pronta de repasse exibida ao concluir o cadastro de um atendimento.
 * Exclusiva do perfil secretária (fluxo operacional da Bianca).
 */
export function canSeeAttendanceHandoffMessage(session: SessionLike): boolean {
  return session?.perfil === "secretaria";
}

export function canManageAttendanceTerminalState(session: SessionLike): boolean {
  return (
    session?.perfil === "admin_owner" ||
    session?.perfil === "secretaria" ||
    session?.perfil === "corretor"
  );
}

/**
 * Exclusão definitiva de um atendimento. Espelha a policy RLS de DELETE:
 * administradores ou o usuário que criou o registro.
 */
export function canDeleteAttendance(
  session: (SessionLike & { id?: string }) | null | undefined,
  attendance: { criadoPorId?: string } | null | undefined,
): boolean {
  if (!session || !attendance) return false;
  if (isAdminUser(session)) return true;
  return Boolean(attendance.criadoPorId && attendance.criadoPorId === session.id);
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
      return ["dashboard", "atendimentos", "clientes", "marketing"];
    default:
      return ["dashboard", "atendimentos", "imoveis", "agenda"];
  }
}
