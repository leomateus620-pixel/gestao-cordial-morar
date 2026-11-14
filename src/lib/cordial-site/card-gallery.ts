import { loadGallery } from "./data";
import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";

export type CardGalleryHint = {
  propertyId: string;
  coverRevision: string;
  items: PublicMedia[];
};

// Metadata reads: at most two concurrent, interaction first. A queued speculative read is
// promoted when the visitor acts on that card, and dropped when the results scope changes.
// In-flight work is shared; settled data is not retained past a fresh reading.
export class SpeculativeDropped extends Error {}

type Entry = { key: string; start: () => void; drop: () => void; urgent: boolean };
const running = new Map<string, Entry>();
const queue: Entry[] = [];
const pending = new Map<string, Promise<PublicMedia[]>>();

function pump() {
  while (running.size < 2 && queue.length) {
    const urgent = queue.findIndex((entry) => entry.urgent);
    if (urgent < 0 && running.size > 0) return;
    queue.splice(Math.max(0, urgent), 1)[0].start();
  }
}

export function requestCardGallery(id: string, brand: SiteBrand, urgent = true, revision = "") {
  const key = `${brand}:${id}:${revision}`;
  const old = pending.get(key);
  if (old) {
    if (urgent) promote(key);
    return old;
  }
  const request = new Promise<PublicMedia[]>((resolve, reject) => {
    const entry: Entry = {
      key,
      urgent,
      start: () => {
        running.set(key, entry);
        loadGallery(id, AbortSignal.timeout(15_000), brand)
          .then(resolve, reject)
          .finally(() => {
            running.delete(key);
            pump();
          });
      },
      drop: () => reject(new SpeculativeDropped()),
    };
    if (urgent) queue.unshift(entry);
    else queue.push(entry);
    pump();
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function promote(key: string) {
  const entry = queue.find((e) => e.key === key) ?? running.get(key);
  if (entry) {
    entry.urgent = true;
    pump();
  }
}

/** New search/page: discard queued speculative reads (running ones finish and are shared). */
export function dropSpeculativeGalleries() {
  for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].urgent) queue.splice(i, 1)[0].drop();
}
