/** Scope presence and successful reads are deliberately not proof of permission to write. */
export type MetaCapabilityName =
  | "app_published"
  | "token_valid"
  | "ads_read_scope"
  | "ads_management_scope"
  | "asset_assigned"
  | "advanced_access"
  | "account_read"
  | "page_read"
  | "lead_retrieval"
  | "write_validated"
  | "lead_received";
export type MetaCapabilityEvidence = {
  state: "available" | "unavailable" | "unverified";
  checked_at: string | null;
  evidence:
    | "not_checked"
    | "token_debug"
    | "graph_read"
    | "validated_command"
    | "persisted_submission";
};
export type MetaCapabilityMatrix = Record<MetaCapabilityName, MetaCapabilityEvidence>;
export function emptyMetaCapabilities(): MetaCapabilityMatrix {
  return Object.fromEntries(
    [
      "app_published",
      "token_valid",
      "ads_read_scope",
      "ads_management_scope",
      "asset_assigned",
      "advanced_access",
      "account_read",
      "page_read",
      "lead_retrieval",
      "write_validated",
      "lead_received",
    ].map((name) => [name, { state: "unverified", checked_at: null, evidence: "not_checked" }]),
  ) as MetaCapabilityMatrix;
}
export function observedMetaCapability(
  value: boolean | null,
  checked_at: string,
  evidence: MetaCapabilityEvidence["evidence"],
): MetaCapabilityEvidence {
  return value === null
    ? { state: "unverified", checked_at: null, evidence: "not_checked" }
    : { state: value ? "available" : "unavailable", checked_at, evidence };
}
