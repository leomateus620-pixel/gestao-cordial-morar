export type MarketingActionPermissions = {
  cordial: Record<string, boolean>;
  morar: Record<string, boolean>;
};

/** Missing capability is denied; a reviewer cannot inherit operational controls. */
export function marketingActionAllowed(
  permissions: MarketingActionPermissions | undefined,
  action: string,
  agency?: string | null,
  profile?: string,
): boolean {
  if (profile === "meta_reviewer" && action !== "read_metrics") return false;
  if (!permissions) return false;
  if (agency && agency !== "todas") {
    if (agency !== "cordial" && agency !== "morar") return false;
    return permissions[agency]?.[action] === true;
  }
  return permissions.cordial?.[action] === true || permissions.morar?.[action] === true;
}
