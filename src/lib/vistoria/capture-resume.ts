// Marcador "estava tirando foto": permite avisar e voltar ao mesmo cômodo/item
// quando o celular fecha a página enquanto a câmera nativa ou a galeria está aberta.

export const RESUME_TTL_MS = 15 * 60_000;
export const RESUME_MESSAGE =
  "O celular fechou a página enquanto a câmera estava aberta (pouca memória) e a foto não chegou. Tente a Câmera do app ou escolha da Galeria.";

export type CaptureOrigin = "camera" | "galeria";
export type CaptureMarker = {
  userId: string;
  inspectionId: string;
  roomId: string;
  itemId: string | null;
  origin: CaptureOrigin;
  at: number;
  loadId: string;
};

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Identificador deste carregamento da página (muda a cada recarga real). */
export const PAGE_LOAD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const markerKey = (userId: string, inspectionId: string) =>
  `vistoria:${userId}:${inspectionId}:captura`;

export function armCaptureMarker(
  store: KV,
  m: Omit<CaptureMarker, "at" | "loadId">,
  now = Date.now(),
  loadId = PAGE_LOAD_ID,
) {
  const marker: CaptureMarker = { ...m, at: now, loadId };
  try {
    store.setItem(markerKey(m.userId, m.inspectionId), JSON.stringify(marker));
  } catch {
    /* armazenamento cheio/indisponível: segue sem marcador */
  }
  return marker;
}

export function clearCaptureMarker(store: KV, userId: string, inspectionId: string) {
  try {
    store.removeItem(markerKey(userId, inspectionId));
  } catch {
    /* ignore */
  }
}

/**
 * Devolve o marcador só depois de uma recarga real, dentro do prazo.
 * No mesmo carregamento (a pessoa só cancelou a câmera) ou expirado, apaga em silêncio.
 */
export function readResumeMarker(
  store: KV,
  userId: string,
  inspectionId: string,
  now = Date.now(),
  loadId = PAGE_LOAD_ID,
): CaptureMarker | null {
  let m: CaptureMarker | null = null;
  try {
    const raw = store.getItem(markerKey(userId, inspectionId));
    m = raw ? (JSON.parse(raw) as CaptureMarker) : null;
  } catch {
    m = null;
  }
  if (!m) return null;
  const valid =
    m.userId === userId &&
    m.inspectionId === inspectionId &&
    typeof m.at === "number" &&
    m.loadId !== loadId &&
    now - m.at >= 0 &&
    now - m.at < RESUME_TTL_MS;
  if (!valid) {
    clearCaptureMarker(store, userId, inspectionId);
    return null;
  }
  return m;
}
