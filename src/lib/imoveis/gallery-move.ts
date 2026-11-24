/** A drag is an operation on a stable photo ID, not a stale replacement of the whole list. */
export type GalleryMove = {
  imageId: string;
  beforeId: string | null;
  afterId: string | null;
  baseOrderedIds: string[];
};

export function describeGalleryMove(
  baseOrderedIds: readonly string[],
  orderedIds: readonly string[],
  imageId: string,
): GalleryMove | null {
  if (!baseOrderedIds.includes(imageId) || !orderedIds.includes(imageId)) return null;
  if (new Set(orderedIds).size !== orderedIds.length) return null;
  if (
    baseOrderedIds.length !== orderedIds.length ||
    orderedIds.some((id) => !baseOrderedIds.includes(id))
  )
    return null;
  const withoutBase = baseOrderedIds.filter((id) => id !== imageId);
  const withoutNext = orderedIds.filter((id) => id !== imageId);
  if (withoutBase.some((id, index) => id !== withoutNext[index])) return null;
  const index = orderedIds.indexOf(imageId);
  return {
    imageId,
    beforeId: index > 0 ? orderedIds[index - 1]! : null,
    afterId: index < orderedIds.length - 1 ? orderedIds[index + 1]! : null,
    baseOrderedIds: [...baseOrderedIds],
  };
}

export type GalleryRebaseResult =
  | { ok: true; orderedIds: string[] }
  | {
      ok: false;
      reason: "target_removed" | "same_photo_changed" | "anchors_removed" | "anchors_crossed";
    };

/** First committed move wins if another user moved the same photo. Compatible additions/removals survive. */
export function rebaseGalleryMove(
  currentOrderedIds: readonly string[],
  move: GalleryMove,
  strict = true,
): GalleryRebaseResult {
  const current = [...currentOrderedIds];
  if (!current.includes(move.imageId)) return { ok: false, reason: "target_removed" };

  const without = current.filter((id) => id !== move.imageId);
  const before = move.beforeId && without.includes(move.beforeId) ? move.beforeId : null;
  const after = move.afterId && without.includes(move.afterId) ? move.afterId : null;
  if (strict && !before && !after && without.length > 0 && move.beforeId && move.afterId) {
    return { ok: false, reason: "anchors_removed" };
  }
  if (strict && before && after && without.indexOf(before) >= without.indexOf(after)) {
    return { ok: false, reason: "anchors_crossed" };
  }

  const insertAt =
    move.beforeId === null
      ? 0
      : before
        ? without.indexOf(before) + 1
        : after
          ? without.indexOf(after)
          : move.afterId === null
            ? without.length
            : Math.min(current.indexOf(move.imageId), without.length);
  without.splice(insertAt, 0, move.imageId);
  // Uma resposta pode ter se perdido depois de a mesma operação ser confirmada.
  if (!strict || without.every((id, index) => current[index] === id)) {
    return { ok: true, orderedIds: without };
  }

  const baseIndex = move.baseOrderedIds.indexOf(move.imageId);
  if (baseIndex < 0) return { ok: false, reason: "same_photo_changed" };
  const beforeBase = move.baseOrderedIds[baseIndex - 1] ?? null;
  const afterBase = move.baseOrderedIds[baseIndex + 1] ?? null;
  // Inserções concorrentes são preservadas. Cruzar um antigo vizinho indica outra edição.
  const targetIndex = current.indexOf(move.imageId);
  if (
    (beforeBase && current.includes(beforeBase) && current.indexOf(beforeBase) > targetIndex) ||
    (afterBase && current.includes(afterBase) && current.indexOf(afterBase) < targetIndex)
  )
    return { ok: false, reason: "same_photo_changed" };
  return { ok: true, orderedIds: without };
}
