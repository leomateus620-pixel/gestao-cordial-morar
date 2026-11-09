import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";
import { mediaPath } from "./presentation";
import { dropSpeculativeGalleries } from "./card-gallery";

export const DEFAULT_CARD_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/** Same candidate list PropertyImage renders, so a preload is reused by the visible <img>. */
export const cardSrcSet = (m: PublicMedia, brand: SiteBrand) =>
  `${mediaPath(m, "thumb", brand)} 480w, ${mediaPath(m, "card", brand)} 960w, ${mediaPath(m, "full", brand)} 1920w`;

// Priority queue: interaction jumps ahead of (and promotes) speculative work; max 2 concurrent.
const MAX_CONCURRENT = 2;
type Entry = { key: string; start: () => void; drop: () => void; urgent: boolean };
let running = 0;
const queue: Entry[] = [];
const ready = new Set<string>();
const pending = new Map<string, Promise<void>>();

export class PreloadDropped extends Error {}

export const preloadKey = (m: PublicMedia, brand: SiteBrand, sizes: string) =>
  `${brand}:${m.id}:${m.version}:${sizes}`;
export const isPreloaded = (m: PublicMedia, brand: SiteBrand, sizes: string) =>
  ready.has(preloadKey(m, brand, sizes));

function pump() {
  while (running < MAX_CONCURRENT && queue.length) queue.shift()!.start();
}

export function preloadCardImage(
  m: PublicMedia,
  brand: SiteBrand,
  sizes = DEFAULT_CARD_SIZES,
  urgent = false,
): Promise<void> {
  const key = preloadKey(m, brand, sizes);
  if (ready.has(key)) return Promise.resolve();
  const old = pending.get(key);
  if (old) {
    if (urgent) {
      const i = queue.findIndex((e) => e.key === key);
      if (i >= 0) {
        const [entry] = queue.splice(i, 1);
        entry.urgent = true;
        queue.unshift(entry);
      }
    }
    return old;
  }
  const promise = new Promise<void>((resolve, reject) => {
    const entry: Entry = {
      key,
      urgent,
      start: () => {
        running++;
        const img = new Image();
        img.decoding = "async";
        img.sizes = sizes;
        img.srcset = cardSrcSet(m, brand);
        img.src = mediaPath(m, "card", brand);
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          running--;
          pump();
          if (ok) resolve();
          else reject(new Error("image"));
        };
        img.onload = () =>
          (img.decode ? img.decode() : Promise.resolve()).then(
            () => done(true),
            () => done(img.naturalWidth > 0),
          );
        img.onerror = () => done(false);
      },
      drop: () => reject(new PreloadDropped()),
    };
    if (urgent) queue.unshift(entry);
    else queue.push(entry);
    pump();
  }).then(
    () => {
      ready.add(key);
      pending.delete(key);
    },
    (error) => {
      pending.delete(key); // failures are not cached, so retry works
      throw error;
    },
  );
  pending.set(key, promise);
  return promise;
}

// Speculative preparation budget per results scope (search + page + layout).
const SPECULATIVE_CARDS = 3;
let scope = "";
let budget = SPECULATIVE_CARDS;
export function takeSpeculativeSlot() {
  if (budget <= 0) return false;
  budget--;
  return true;
}
/** Called when filters/page/layout change: new budget, queued speculative work discarded. */
export function resetSpeculativeScope(next: string) {
  if (next === scope) return;
  scope = next;
  budget = SPECULATIVE_CARDS;
  for (let i = queue.length - 1; i >= 0; i--)
    if (!queue[i].urgent) queue.splice(i, 1)[0].drop();
  dropSpeculativeGalleries();
}
export const preloadIdle = () => running === 0 && queue.length === 0;
