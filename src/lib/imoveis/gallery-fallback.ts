/**
 * Decide se a galeria pode seguir a ordem da fila (PR #50) ou precisa cair
 * para a ordem do banco. Nenhuma foto ativa pode sumir da tela.
 *
 * Chave de cada foto = `uploadKey ?? id` (fotos antigas usam o próprio id),
 * então imóveis só com fotos antigas continuam no modo `queue`.
 */
export type GalleryMode = "queue" | "safe";

export type GalleryImageLike = {
  id: string;
  uploadKey?: string | null;
  position?: number | null;
};

export function galleryImageKey(image: GalleryImageLike): string {
  return image.uploadKey ?? image.id;
}

export function resolveGalleryMode(
  activeImages: readonly GalleryImageLike[] | undefined,
  loadedKeys: readonly string[] | undefined,
): GalleryMode {
  if (!activeImages || !loadedKeys) return "safe";
  const keys = new Set(loadedKeys);
  return activeImages.every((image) => keys.has(galleryImageKey(image))) ? "queue" : "safe";
}

/** Ordem do banco: position crescente (capa na posição 0). */
export function orderByDatabase<T extends GalleryImageLike>(images: readonly T[]): T[] {
  return [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function resolveGalleryPhotos<T extends GalleryImageLike>(input: {
  activeImages: readonly T[] | undefined;
  loadedKeys: readonly string[] | undefined;
  queuePhotos: readonly T[];
  fallbackImages: readonly T[];
}): { mode: GalleryMode; photos: T[] } {
  const mode = resolveGalleryMode(input.activeImages, input.loadedKeys);
  if (mode === "queue") return { mode, photos: [...input.queuePhotos] };
  return { mode, photos: orderByDatabase(input.activeImages ?? input.fallbackImages) };
}

/** Miniatura: só usa a miniatura gravada; foto antiga usa a foto inteira. */
export function pickThumbUrl(storedThumbUrl: string | undefined, fullUrl: string): string {
  return storedThumbUrl ?? fullUrl;
}
