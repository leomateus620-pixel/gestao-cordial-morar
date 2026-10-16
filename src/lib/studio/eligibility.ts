/**
 * Elegibilidade do Estúdio: reusa a mesma noção pública de elegibilidade de
 * imóvel (shared_selection_property_eligible / shared_selection_check) — só
 * imóvel publicado e elegível pode virar conteúdo. Esta função é pura e só
 * filtra uma lista já marcada pelo backend; a checagem real roda no banco.
 */

export type EligibilityCandidate = { id: string; eligible: boolean; exists: boolean };

export function onlyEligible<T extends EligibilityCandidate>(items: readonly T[]): T[] {
  return items.filter((i) => i.exists && i.eligible);
}

export function eligibilityReason(c: EligibilityCandidate): "ok" | "nao_encontrado" | "nao_elegivel" {
  if (!c.exists) return "nao_encontrado";
  if (!c.eligible) return "nao_elegivel";
  return "ok";
}

/** Espelha a visibilidade por papel: gestor vê tudo da imobiliária; corretor só os próprios. */
export type StudioRole = "admin" | "secretaria" | "corretor" | string;

export function canManageAllAgencyProjects(roles: readonly StudioRole[]): boolean {
  return roles.includes("admin") || roles.includes("secretaria");
}

export function visibleStudioProjects<T extends { owner_id: string }>(
  rows: readonly T[],
  uid: string,
  roles: readonly StudioRole[],
): T[] {
  if (canManageAllAgencyProjects(roles)) return [...rows];
  return rows.filter((r) => r.owner_id === uid);
}

export function canApprove(roles: readonly StudioRole[], ownerId: string, uid: string): boolean {
  return canManageAllAgencyProjects(roles) || ownerId === uid;
}
