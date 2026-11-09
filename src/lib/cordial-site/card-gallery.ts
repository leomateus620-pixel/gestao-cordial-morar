import { loadGallery } from "./data";
import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";

// Metadata reads: at most two concurrent, interaction first. A queued speculative read is
// promoted when the visitor acts on that card, and dropped when the results scope changes.
// In-flight work is shared; settled data is not retained past a fresh reading.
export class SpeculativeDropped extends Error {}

type Entry = { key: string; start: () => void; drop: () => void; urgent: boolean };
let running = 0;
const queue: Entry[] = [];
const pending = new Map<string, Promise<PublicMedia[]>>();

function pump() {
  while (running < 2 && queue.length) queue.shift()!.start();
}

export function requestCardGallery(id: string, brand: SiteBrand, urgent = true) {
  const key = `${brand}:${id}`;
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
        running++;
        loadGallery(id, AbortSignal.timeout(15_000), brand)
          .then(resolve, reject)
          .finally(() => {
            running--;
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
  const i = queue.findIndex((e) => e.key === key);
  if (i > 0) {
    const [entry] = queue.splice(i, 1);
    entry.urgent = true;
    queue.unshift(entry);
  } else if (i === 0) queue[0].urgent = true;
}

/** New search/page: discard queued speculative reads (running ones finish and are shared). */
export function dropSpeculativeGalleries() {
  for (let i = queue.length - 1; i >= 0; i--)
    if (!queue[i].urgent) queue.splice(i, 1)[0].drop();
}
