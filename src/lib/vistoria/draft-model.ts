/** Text drafts belong to a user, inspection, room, entity and field set. */
export type DraftEntity =
  | "item"
  | "room"
  | "inspection"
  | "media"
  | "note"
  | "narrative"
  | "new-item"
  | "creation";
export type DraftScope = {
  userId: string;
  inspectionId: string;
  roomId: string | null;
  entity: DraftEntity;
  entityId: string;
};
export type DraftEntry = DraftScope & {
  key: string;
  patch: Record<string, unknown>;
  base: Record<string, unknown>;
  expectedRevision: number;
  generation: string;
  updatedAt: string;
  writerId?: string;
  recovered?: boolean;
};
export const draftKey = (s: DraftScope) =>
  JSON.stringify([s.userId, s.inspectionId, s.roomId, s.entity, s.entityId]);
export const equalDraftValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** A different tab must not destroy the only durable copy of an unsent edit. */
export function displacedDraft(previous: DraftEntry | undefined, incoming: DraftEntry) {
  if (
    !previous ||
    previous.writerId === incoming.writerId ||
    previous.generation === incoming.generation
  )
    return null;
  return { ...previous, key: `${previous.key}~${previous.generation}`, recovered: true };
}
export function conflictingFields(entry: DraftEntry, remote: Record<string, unknown>) {
  return Object.keys(entry.patch).filter(
    (k) =>
      !equalDraftValue(remote[k], entry.base[k]) && !equalDraftValue(remote[k], entry.patch[k]),
  );
}
export function mergeDraft(
  entry: DraftEntry | undefined,
  scope: DraftScope,
  remote: Record<string, unknown>,
  patch: Record<string, unknown>,
): DraftEntry {
  const base = { ...entry?.base };
  for (const k of Object.keys(patch)) if (!(k in base)) base[k] = remote[k] ?? null;
  return {
    ...scope,
    key: draftKey(scope),
    base,
    patch: { ...entry?.patch, ...patch },
    expectedRevision: entry?.expectedRevision ?? Number(remote.revision ?? 0),
    generation: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
}
/** A response may acknowledge only the generation that was actually sent. */
export function acknowledgeDraft(
  current: DraftEntry,
  sent: DraftEntry,
  revision: number,
): DraftEntry | null {
  if (current.generation === sent.generation) return null;
  return { ...current, base: { ...current.base, ...sent.patch }, expectedRevision: revision };
}
