import { loadGallery } from "./data";
import type { PublicMedia } from "./contract";
import type { SiteBrand } from "./brand";

// Metadata is requested only on explicit intent, at most two concurrent reads.
// In-flight work is shared; settled data is not retained past a fresh reading.
let running = 0;
const queue: Array<() => void> = [];
const pending = new Map<string, Promise<PublicMedia[]>>();
export function requestCardGallery(id: string, brand: SiteBrand) {
  const key = `${brand}:${id}`;
  const old = pending.get(key);
  if (old) return old;
  const request = new Promise<PublicMedia[]>((resolve, reject) => {
    const start = () => {
      running++;
      loadGallery(id, AbortSignal.timeout(15_000), brand)
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < 2) start();
    else queue.push(start);
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
