import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import type { PublicMedia } from "@/lib/cordial-site/contract";
import { featuredAdapter } from "./featured";

const activeRow = z.object({
  slot: z.number().int().min(1).max(5),
  public_id: z.string().uuid(),
  media_id: z.string().uuid(),
  media_version: z.string().regex(/^[a-f0-9]{32}$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  ordinal: z.number().int().min(0).max(2),
});
export type PublicFeatured = z.infer<typeof activeRow>[];
export async function activeFeatured(
  db: SupabaseClient,
  brand: SiteBrand,
): Promise<PublicFeatured> {
  const { data, error } = await db.rpc(featuredAdapter(brand).active);
  if (error) return []; // Original photos remain available during a staged deployment.
  return z.array(activeRow).parse(data ?? []);
}

export async function enhanceGallery(
  db: SupabaseClient,
  brand: SiteBrand,
  publicId: string,
  input: PublicMedia[] | PromiseLike<PublicMedia[]>,
) {
  const [{ data, error }, photos] = await Promise.all([
    db
      .from(featuredAdapter(brand).authorized)
      .select("media_id,media_version,checksum")
      .eq("public_id", publicId)
      .limit(3),
    input,
  ]);
  if (error) return photos;
  return photos.map((photo) => {
    const edit = data?.find((p) => p.media_id === photo.id && p.media_version === photo.version);
    return edit ? { ...photo, enhancement: edit.checksum as string } : photo;
  });
}

const bytesCache = new Map<string, Uint8Array>();
const hash = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
/** Precomputed JPEG only: no AI, decoding or raster work on a public request. */
export async function featuredMediaResponse(
  db: SupabaseClient,
  brand: SiteBrand,
  id: string,
  version: string,
  size: string,
  checksum: string,
  request?: Request,
) {
  const unavailable = () =>
    new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!/^[a-f0-9]{64}$/.test(checksum) || !["thumb", "card", "full"].includes(size))
    return unavailable();
  const A = featuredAdapter(brand);
  const authorize = () =>
    db
      .from(A.authorized)
      .select("storage_prefix,variants")
      .eq("media_id", id)
      .eq("media_version", version)
      .eq("checksum", checksum)
      .maybeSingle();
  const source = await authorize();
  if (source.error || !source.data) return unavailable();
  const variant = z
    .object({
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
      bytes: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
    })
    .safeParse(source.data.variants?.[size]);
  if (!variant.success) return unavailable();
  const etag = `"${variant.data.checksum}"`,
    headers = {
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      ETag: etag,
    };
  if (request?.headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers });
  const key = `${brand}:${id}:${version}:${checksum}:${size}`;
  let bytes = bytesCache.get(key);
  if (!bytes) {
    const stored = await db.storage
      .from(A.bucket)
      .download(`${source.data.storage_prefix}/${size}.jpg`);
    if (stored.error || !stored.data || stored.data.size !== variant.data.bytes)
      return unavailable();
    bytes = new Uint8Array(await stored.data.arrayBuffer());
    if ((await hash(bytes)) !== variant.data.checksum) return unavailable();
    const still = await authorize();
    if (still.error || !still.data) return unavailable();
    bytesCache.set(key, bytes);
    let total = [...bytesCache.values()].reduce((n, b) => n + b.length, 0);
    while (total > 24 * 1024 * 1024) {
      const oldest = bytesCache.keys().next().value!;
      total -= bytesCache.get(oldest)!.length;
      bytesCache.delete(oldest);
    }
  }
  return new Response(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), { headers });
}
