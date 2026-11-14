import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";
import { mediaPath } from "./presentation";
import { dropSpeculativeGalleries } from "./card-gallery";

export const DEFAULT_CARD_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/** Same candidate list PropertyImage renders, so a preload is reused by the visible <img>. */
export const cardSrcSet = (m: PublicMedia, brand: SiteBrand) =>
  `${mediaPath(m, "thumb", brand)} 480w, ${mediaPath(m, "card", brand)} 960w, ${mediaPath(m, "full", brand)} 1920w`;

// Leave one slot free for navigation even if a background request is slow.
const MAX_CONCURRENT = 6;
const MAX_READY = 32;
const MAX_READY_PIXELS = 12_000_000;
const IMAGE_TIMEOUT = 12_000;
type PhotoSize = "card" | "full";
type Entry = {
  key: string;
  start: () => void;
  drop: () => void;
  urgent: boolean;
  priority: number;
  image?: HTMLImageElement;
};
const queue: Entry[] = [];
const running = new Map<string, Entry>();
const ready = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();
// naturalWidth on a srcset image is density-corrected, so account for the actual
// decoded candidate rather than undercounting memory on Retina/mobile screens.
const decodedPixels = (img: HTMLImageElement) => {
  const width = img.currentSrc?.split("?")[0].endsWith("/full")
    ? 1920
    : img.currentSrc?.split("?")[0].endsWith("/card")
      ? 960
      : 480;
  return width * width * (img.naturalHeight / img.naturalWidth || 1);
};

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
    const next = queue.reduce(
      (best, entry, i) =>
        entry.priority > queue[best].priority ||
        (entry.urgent && entry.priority === queue[best].priority)
          ? i
          : best,
      0,
    );
    const candidate = queue[next];
    // Ordinary catalog speculation stays serial. The five featured cards can use
    // one slot per featured card, always leaving a sixth for an actual click.
    if (!candidate.urgent && running.size >= (candidate.priority > 0 ? 5 : 1)) return;
    const [entry] = queue.splice(next, 1);
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
  preparation: "background" | "featured" | "intent" = "background",
): Promise<void> {
  const key = `${brand}:${m.id}:${m.version}:${m.enhancement ?? ""}:${size}:${sizes}:${window.innerWidth}:${window.devicePixelRatio}`;
  const cached = ready.get(key);
  if (cached) {
    ready.delete(key);
    ready.set(key, cached);
    return Promise.resolve();
  }
  const old = pending.get(key);
  const priority = urgent ? 3 : preparation === "intent" ? 2 : preparation === "featured" ? 1 : 0;
  if (old) {
    if (priority > 0) {
      const index = queue.findIndex((entry) => entry.key === key);
      const entry = index < 0 ? running.get(key) : queue.splice(index, 1)[0];
      if (entry) {
        entry.urgent ||= urgent;
        entry.priority = Math.max(entry.priority, priority);
        if (index >= 0) queue.push(entry);
        else if (entry.image && urgent) entry.image.fetchPriority = "high";
        pump();
      }
    }
    return old;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const entry: Entry = {
      key,
      urgent,
      priority,
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
      let pixels = [...ready.values()].reduce((total, photo) => total + decodedPixels(photo), 0);
      while (ready.size > MAX_READY || (ready.size > 1 && pixels > MAX_READY_PIXELS)) {
        const oldest = ready.keys().next().value!;
        const photo = ready.get(oldest)!;
        pixels -= decodedPixels(photo);
        ready.delete(oldest);
      }
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
