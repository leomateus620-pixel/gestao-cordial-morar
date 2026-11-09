import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";
import { mediaPath } from "./presentation";

export const DEFAULT_CARD_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/** Same candidate list PropertyImage renders, so a preload is reused by the visible <img>. */
export const cardSrcSet = (m: PublicMedia, brand: SiteBrand) =>
  `${mediaPath(m, "thumb", brand)} 480w, ${mediaPath(m, "card", brand)} 960w, ${mediaPath(m, "full", brand)} 1920w`;

// Small priority queue: interaction jumps ahead of speculative work; max 2 concurrent decodes.
const MAX_CONCURRENT = 2;
let running = 0;
const queue: Array<() => void> = [];
const ready = new Set<string>();
const pending = new Map<string, Promise<void>>();

export const preloadKey = (m: PublicMedia, brand: SiteBrand, sizes: string) =>
  `${brand}:${m.id}:${m.version}:${sizes}`;
export const isPreloaded = (m: PublicMedia, brand: SiteBrand, sizes: string) =>
  ready.has(preloadKey(m, brand, sizes));

function pump() {
  while (running < MAX_CONCURRENT && queue.length) queue.shift()!();
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
  if (old) return old;
  const promise = new Promise<void>((resolve, reject) => {
    const start = () => {
      running++;
      const img = new Image();
      img.decoding = "async";
      img.sizes = sizes;
      img.srcset = cardSrcSet(m, brand);
      img.src = mediaPath(m, "card", brand);
      const done = (ok: boolean) => {
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
    };
    if (urgent) queue.unshift(start);
    else queue.push(start);
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

// Touch devices: speculative neighbour preparation for only a few visible cards.
let speculativeBudget = 4;
export function takeSpeculativeSlot() {
  if (speculativeBudget <= 0) return false;
  speculativeBudget--;
  return true;
}
