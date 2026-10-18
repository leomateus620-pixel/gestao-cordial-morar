/** Visitor drafts contain only public Cordial UUIDs; they never carry business data. */
export const VISITOR_SELECTION_LIMIT = 20;
export const RECENT_PROPERTIES_LIMIT = 12;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePublicIds(value: unknown, limit = VISITOR_SELECTION_LIMIT): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id): id is string => typeof id === "string" && uuid.test(id))),
  ].slice(0, limit);
}

export function visitorSelectionFingerprint(ids: string[]) {
  // Order belongs to the shared selection, so a reorder requires a fresh save.
  return normalizePublicIds(ids).join(",");
}

export function pushRecentProperty(ids: string[], id: string) {
  return normalizePublicIds([id, ...ids.filter((item) => item !== id)], RECENT_PROPERTIES_LIMIT);
}
