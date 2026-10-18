import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteBrand } from "./brand";

export const derivativeBucket = "public-site-derivatives";
export const derivativeTransformer = "purejs-v2";
export type MediaSize = "thumb" | "card" | "full";
export const derivativeOptions = (size: MediaSize) => ({
  width: size === "thumb" ? 480 : size === "card" ? 960 : 1920,
  quality: size === "full" ? 88 : 80,
});
export function derivativeKey(brand: SiteBrand, id: string, version: string, size: MediaSize) {
  const { width, quality } = derivativeOptions(size);
  return `${brand}/${id}/${version}/${width}-jpeg-q${quality}-${derivativeTransformer}.jpg`;
}
export async function checksum(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export type DerivativeStore = {
  read(key: string): Promise<{ bytes: Uint8Array; checksum: string } | null>;
  claim(key: string): Promise<string | null>;
  publish(key: string, lease: string, bytes: Uint8Array, hash: string): Promise<void>;
  invalidate(key: string): Promise<void>;
  release(key: string, lease: string): Promise<void>;
};
export class DerivativePending extends Error {}
const inflight = new Map<string, Promise<Uint8Array>>();
async function validStored(store: DerivativeStore, key: string) {
  const entry = await store.read(key);
  if (!entry) return null;
  const { bytes } = entry;
  if (
    bytes.length >= 32 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9 &&
    (await checksum(bytes)) === entry.checksum
  )
    return bytes;
  await store.invalidate(key);
  return null;
}
/** Reuses private bytes; authorization belongs to the gateway and is never cached here. */
export async function resolveDerivative(
  key: string,
  store: DerivativeStore,
  generate: () => Promise<Uint8Array>,
) {
  const active = inflight.get(key);
  if (active) return active;
  const task = (async () => {
    const stored = await validStored(store, key);
    if (stored) return stored;
    const lease = await store.claim(key);
    if (!lease) {
      // Another instance owns the durable lease. Never repeat its CPU work.
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const completed = await validStored(store, key);
        if (completed) return completed;
      }
      throw new DerivativePending("Imagem em preparação. Tente novamente.");
    }
    try {
      const bytes = await generate();
      await store.publish(key, lease, bytes, await checksum(bytes));
      return bytes;
    } catch (error) {
      await store.release(key, lease).catch(() => undefined);
      throw error;
    }
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
export function derivativeStore(db: SupabaseClient): DerivativeStore {
  return {
    async read(key) {
      const { data, error } = await db
        .from("public_site_derivatives")
        .select("checksum,state")
        .eq("key", key)
        .maybeSingle();
      if (error) throw new Error("Derivative metadata unavailable");
      if (!data || data.state !== "ready") return null;
      const downloaded = await db.storage.from(derivativeBucket).download(key);
      if (downloaded.error || !downloaded.data) {
        // A lost object is repairable; an unavailable storage service must not trigger duplicate work.
        const code = String((downloaded.error as { statusCode?: string } | null)?.statusCode ?? "");
        if (
          code === "404" ||
          (code === "400" && downloaded.error?.message === "Object not found")
        ) {
          await db
            .from("public_site_derivatives")
            .update({ state: "failed", checksum: null })
            .eq("key", key)
            .eq("state", "ready");
          return null;
        }
        throw new Error("Derivative storage unavailable");
      }
      if (downloaded.data.size > 25 * 1024 * 1024)
        return { bytes: new Uint8Array(), checksum: "invalid" };
      return {
        bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
        checksum: data.checksum ?? "",
      };
    },
    async claim(key) {
      const { data, error } = await db.rpc("public_site_claim_derivative", { _key: key });
      if (error) throw new Error("Derivative lease unavailable");
      return typeof data === "string" ? data : null;
    },
    async publish(key, lease, bytes, hash) {
      const upload = await db.storage.from(derivativeBucket).upload(key, new Uint8Array(bytes), {
        contentType: "image/jpeg",
        cacheControl: "0",
        upsert: true,
      });
      if (upload.error) throw new Error("Derivative persistence unavailable");
      const result = await db.rpc("public_site_finish_derivative", {
        _key: key,
        _lease: lease,
        _checksum: hash,
      });
      if (result.error || result.data !== true) throw new Error("Derivative lease expired");
    },
    async invalidate(key) {
      const result = await db
        .from("public_site_derivatives")
        .update({ state: "failed", checksum: null })
        .eq("key", key)
        .eq("state", "ready");
      if (result.error) throw new Error("Derivative invalidation unavailable");
    },
    async release(key, lease) {
      await db
        .from("public_site_derivatives")
        .update({ state: "failed", lease_until: null })
        .eq("key", key)
        .eq("lease", lease);
    },
  };
}
