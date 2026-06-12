import type { PropsWithChildren, ReactNode } from "react";
import { useSession } from "@/lib/auth-mock";
import type { AppModule, Permission } from "@/lib/mock/permissions";

type PermissionGuardProps = PropsWithChildren<{
  permissions?: Permission[];
  modules?: AppModule[];
  mode?: "all" | "any";
  fallback?: ReactNode;
}>;

function matches(required: string[] | undefined, current: string[], mode: "all" | "any") {
  if (!required?.length) return true;
  return mode === "all"
    ? required.every((item) => current.includes(item))
    : required.some((item) => current.includes(item));
}

export function PermissionGuard({
  permissions,
  modules,
  mode = "any",
  fallback = null,
  children,
}: PermissionGuardProps) {
  const session = useSession();

  if (!session) return fallback;

  const canView =
    matches(permissions, session.permissions, mode) && matches(modules, session.modules, mode);

  return canView ? children : fallback;
}
