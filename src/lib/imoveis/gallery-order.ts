import { rebaseGalleryMove, type GalleryMove } from "./gallery-move";

export const GALLERY_KEY_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function galleryUploadKey(path: string): string | undefined {
  const name = path.split("/")[2];
  const key = name?.slice(8, 44);
  return name?.startsWith("galeria-") && name[44] === "-" && key && GALLERY_KEY_PATTERN.test(key)
    ? key
    : undefined;
}

export type GalleryEdit =
  | { type: "append"; keys: string[] }
  | { type: "discard"; key: string }
  | { type: "move"; move: GalleryMove };

export type GalleryOrderSnapshot = {
  revision: number;
  keys: string[];
  activeKeys: string[];
};

/** A ordem das fotos existentes vem do banco. Cada reserva segue sua próxima foto-âncora. */
export function mergeGallerySlots(activeKeys: string[], plan: string[]): string[] {
  const active = new Set(activeKeys);
  const before = new Map<string, string[]>();
  let pending: string[] = [];
  for (const key of plan) {
    if (active.has(key)) {
      if (pending.length) before.set(key, pending);
      pending = [];
    } else {
      pending.push(key);
    }
  }
  return [...activeKeys.flatMap((key) => [...(before.get(key) ?? []), key]), ...pending];
}

export function sameGalleryOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function applyGalleryEdits(
  snapshot: GalleryOrderSnapshot,
  edits: readonly GalleryEdit[],
  strict = true,
): string[] {
  const active = new Set(snapshot.activeKeys);
  let keys = snapshot.keys;
  for (const edit of edits) {
    if (edit.type === "append") {
      keys = [...new Set([...keys, ...edit.keys])];
    } else if (edit.type === "discard") {
      if (!active.has(edit.key)) keys = keys.filter((key) => key !== edit.key);
    } else {
      // Uma reserva pode ter sido resolvida como duplicada, ou a foto removida.
      if (!keys.includes(edit.move.imageId)) continue;
      const result = rebaseGalleryMove(keys, edit.move, strict);
      if (!result.ok) {
        if (strict) throw new Error(`conflito_ordenacao: ${result.reason}`);
        continue;
      }
      keys = result.orderedIds;
    }
  }
  return keys;
}

export type GallerySaveState = "idle" | "saving" | "saved" | "error";
const INITIAL_ORDER: GalleryOrderSnapshot = { revision: -1, keys: [], activeKeys: [] };
const SAVE_DELAY_MS = 160;

/** Uma fila por galeria. Apenas a geração confirmada sai da fila. */
export function createGalleryOrderQueue(
  persist: (edits: GalleryEdit[], retry: boolean) => Promise<GalleryOrderSnapshot>,
) {
  let base = INITIAL_ORDER;
  let edits: GalleryEdit[] = [];
  let status: GallerySaveState = "idle";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  let view: { keys: string[]; status: GallerySaveState } = { keys: base.keys, status };

  function publish() {
    view = { keys: applyGalleryEdits(base, edits, false), status };
    listeners.forEach((listener) => listener());
  }

  function receive(snapshot: GalleryOrderSnapshot) {
    if (snapshot.revision < base.revision) return;
    base = snapshot;
    publish();
  }

  async function drain(retry: boolean) {
    while (edits.length) {
      const batch = edits;
      try {
        const saved = await persist(batch, retry);
        if (saved.revision >= base.revision) base = saved;
        edits = edits.slice(batch.length);
      } catch (error) {
        if (edits !== batch) continue;
        status = "error";
        publish();
        throw error;
      }
      status = edits.length ? "saving" : "saved";
      publish();
    }
  }

  function flush() {
    clearTimeout(timer);
    if (running) return running;
    if (!edits.length) return Promise.resolve();
    const retry = status === "error";
    status = "saving";
    publish();
    running = drain(retry).finally(() => {
      running = undefined;
    });
    return running;
  }

  function enqueue(edit: GalleryEdit) {
    edits = [...edits, edit];
    // Após uma falha, a nova ação funciona na tela e a tentativa continua explícita.
    if (status !== "error") status = "saving";
    publish();
    clearTimeout(timer);
    if (status !== "error")
      timer = setTimeout(() => {
        void flush().catch(() => undefined);
      }, SAVE_DELAY_MS);
  }

  return {
    receive,
    enqueue,
    flush,
    hasPending: () => edits.length > 0,
    getSnapshot: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
