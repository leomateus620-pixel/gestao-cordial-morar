// Pure role mapping (no client imports) so it can be unit-tested directly.
import type { UserProfile } from "./mock/permissions.ts";

export function pickHighestRole(roles: UserProfile[]): UserProfile {
  // Deny-dominant external roles first: they must never inherit a staff profile.
  const order: UserProfile[] = [
    "meta_reviewer",
    "atendimentos_viewer",
    "admin_owner",
    "financeiro_admin",
    "secretaria",
    "corretor",
  ];
  for (const r of order) if (roles.includes(r)) return r;
  return "corretor";
}

// Map DB enum (app_role) -> existing UserProfile keys used by permissions.
export function mapDbRole(role: string): UserProfile {
  switch (role) {
    case "admin":
      return "admin_owner";
    case "financeiro":
      return "financeiro_admin";
    case "secretaria":
      return "secretaria";
    case "meta_reviewer":
      return "meta_reviewer";
    case "atendimentos_viewer":
      return "atendimentos_viewer";
    case "corretor":
    default:
      return "corretor";
  }
}
