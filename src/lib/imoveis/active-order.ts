/**
 * Regra única da galeria ativa (22/09/2026): a ordem e a capa valem só para
 * fotos ativas. Foto aguardando exclusão nos sites fica guardada, mas não entra
 * na lista, não conta na validação e nunca volta a ser capa. Espelha
 * `reorder_property_images` no banco.
 */
export type GalleryRow = { id: string; pendingRemoteDelete: boolean };

export type ActiveOrderCheck =
  | { ok: true; coverId: string }
  | { ok: false; reason: "vazia" | "repetida" | "fora_da_galeria" | "incompleta" };

export function checkActiveOrder(rows: GalleryRow[], orderedIds: string[]): ActiveOrderCheck {
  if (!orderedIds.length) return { ok: false, reason: "vazia" };
  if (new Set(orderedIds).size !== orderedIds.length) return { ok: false, reason: "repetida" };
  const active = new Set(rows.filter((row) => !row.pendingRemoteDelete).map((row) => row.id));
  if (orderedIds.some((id) => !active.has(id))) return { ok: false, reason: "fora_da_galeria" };
  if (orderedIds.length !== active.size) return { ok: false, reason: "incompleta" };
  return { ok: true, coverId: orderedIds[0]! };
}
