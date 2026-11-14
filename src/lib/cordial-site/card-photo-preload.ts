import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";
import { mediaPath } from "./presentation";
import { dropSpeculativeGalleries } from "./card-gallery";

export const DEFAULT_CARD_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/** Same candidate list PropertyImage renders, so a preload is reused by the visible <img>. */
export const cardSrcSet = (m: PublicMedia, brand: SiteBrand) =>
  `${mediaPath(m, "thumb", brand)} 480w, ${mediaPath(m, "card", brand)} 960w, ${mediaPath(m, "full", brand)} 1920w`;

// Leave one slot free for navigation even if a background request is slow.
const MAX_CONCURRENT = 2;
const MAX_READY = 8;
const IMAGE_TIMEOUT = 12_000;
type PhotoSize = "card" | "full";
type Entry = {
  key: string;
  start: () => void;
  drop: () => void;
  urgent: boolean;
  image?: HTMLImageElement;
};
const queue: Entry[] = [];
const running = new Map<string, Entry>();
const ready = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

export class PreloadDropped extends Error {}

export function canSpeculatePhotos() {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return (
    document.visibilityState !== "hidden" &&
    !connection?.saveData &&
    connection?.effectiveType !== "slow-2g" &&
    connection?.effectiveType !== "2g"
  );
}

function pump() {
  while (running.size < MAX_CONCURRENT && queue.length) {
    let urgent = queue.length - 1;
    while (urgent >= 0 && !queue[urgent].urgent) urgent--;
    if (urgent < 0 && running.size > 0) return;
    const [entry] = queue.splice(Math.max(0, urgent), 1);
    if (!entry.urgent && !canSpeculatePhotos()) entry.drop();
    else entry.start();
  }
}

export function preloadCardImage(
  m: PublicMedia,
  brand: SiteBrand,
  sizes = DEFAULT_CARD_SIZES,
  urgent = false,
  size: PhotoSize = "card",
): Promise<void> {
  const key = `${brand}:${m.id}:${m.version}:${size}:${sizes}:${window.innerWidth}:${window.devicePixelRatio}`;
  const cached = ready.get(key);
  if (cached) {
    ready.delete(key);
    ready.set(key, cached);
    return Promise.resolve();
  }
  const old = pending.get(key);
  if (old) {
    if (urgent) {
      const index = queue.findIndex((entry) => entry.key === key);
      const entry = index < 0 ? running.get(key) : queue.splice(index, 1)[0];
      if (entry) {
        entry.urgent = true;
        if (index >= 0) queue.push(entry);
        else if (entry.image) entry.image.fetchPriority = "high";
        pump();
      }
    }
    return old;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const entry: Entry = {
      key,
      urgent,
      start: () => {
        const img = new Image();
        entry.image = img;
        running.set(key, entry);
        img.decoding = "async";
        img.fetchPriority = entry.urgent ? "high" : "low";
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          img.onload = img.onerror = null;
          running.delete(key);
          if (ok) resolve(img);
          else {
            img.removeAttribute("srcset");
            img.removeAttribute("src");
            reject(new Error("Não foi possível carregar a foto."));
          }
          pump();
        };
        const timer = window.setTimeout(() => done(false), IMAGE_TIMEOUT);
        img.onload = () =>
          (img.decode ? img.decode() : Promise.resolve()).then(
            () => done(true),
            () => done(img.naturalWidth > 0),
          );
        img.onerror = () => done(false);
        img.sizes = sizes;
        img.srcset = cardSrcSet(m, brand);
        img.src = mediaPath(m, size, brand);
      },
      drop: () => reject(new PreloadDropped()),
    };
    queue.push(entry);
    pump();
  }).then(
    (img) => {
      ready.set(key, img);
      if (ready.size > MAX_READY) ready.delete(ready.keys().next().value!);
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
  if (budget <= 0 || !canSpeculatePhotos()) return false;
  budget--;
  return true;
}
/** Called when filters/page/layout change: new budget, queued speculative work discarded. */
export function resetSpeculativeScope(next: string) {
  if (next === scope) return;
  scope = next;
  budget = SPECULATIVE_CARDS;
  for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].urgent) queue.splice(i, 1)[0].drop();
  dropSpeculativeGalleries();
}
