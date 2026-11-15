import { z } from "zod";
import type { Raster } from "@/lib/imoveis/watermark-purejs.server";
import type { SiteBrand } from "@/lib/cordial-site/brand";

export const FEATURED_TREATMENT_VERSION = "faithful-tone-v1";
export const FEATURED_PHOTO_COUNT = 3;
export const FEATURED_PROPERTY_COUNT = 5;
export const FEATURED_SCHEDULE = { prepareDow: 5, prepareHour: 18, activateHour: 6 };
export const tonePlanSchema = z
  .object({
    exposure: z.number().min(-0.25).max(0.55),
    contrast: z.number().min(0.94).max(1.12),
    saturation: z.number().min(0.94).max(1.12),
    warmth: z.number().min(-0.04).max(0.04),
    shadows: z.number().min(0).max(0.08),
    sharpness: z.number().min(0).max(0.35),
    reason: z.string().min(1).max(240),
  })
  .strict();
export type TonePlan = z.infer<typeof tonePlanSchema>;

export const featuredPolicySchema = z.object({
  enabled: z.boolean().default(false),
  authorizedAt: z.string().datetime(),
  authorizedBy: z.string().uuid().nullable(),
  authorization: z.string().min(10).max(1000),
  treatment: z.literal(FEATURED_TREATMENT_VERSION),
});
export type FeaturedPolicy = z.infer<typeof featuredPolicySchema>;

export function featuredAdapter(brand: SiteBrand) {
  if (brand !== "cordial" && brand !== "morar") throw new Error("Marca inválida.");
  const base = `${brand}_site_featured`;
  return {
    weeks: `${base}_weeks`,
    items: `${base}_items`,
    photos: `${base}_photos`,
    events: `${base}_events`,
    settings: `${brand}_site_showcase_settings`,
    media: `${brand}_site_authorized_media`,
    authorized: `${base}_authorized_photos`,
    bucket: `${brand}-showcase`,
    plan: `${base}_plan`,
    claim: `${base}_claim`,
    activate: `${base}_activate`,
    active: `${base}_active`,
  };
}

/** New eligible properties first; use recent ones only when the available pool is too small. */
export function rotateFeatured<T extends { id: string; publishedAt: string; cover: unknown }>(
  pool: T[],
  recentlyUsed: string[],
): T[] {
  const recent = new Set(recentlyUsed);
  const unique = [...new Map(pool.filter((p) => p.cover).map((p) => [p.id, p])).values()];
  return unique
    .sort(
      (a, b) =>
        Number(recent.has(a.id)) - Number(recent.has(b.id)) ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, FEATURED_PROPERTY_COUNT);
}

/** Photometric adjustments only. No pixel changes position; there is no generative image step. */
export function applyTone(source: Raster, input: TonePlan): Raster {
  const plan = tonePlanSchema.parse(input);
  const { width, height } = source;
  if (!width || !height || source.data.length !== width * height * 4)
    throw new Error("Foto inválida.");
  const out = new Uint8Array(source.data.length);
  const curve = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const value = i / 255;
    // Smooth midtone exposure preserves black/white endpoints and highlight detail.
    const exposed = Math.pow(value, 2 ** -plan.exposure);
    curve[i] = Math.max(
      0,
      Math.min(
        1,
        (exposed - 0.5) * plan.contrast + 0.5 + plan.shadows * 4 * value * (1 - value) ** 3,
      ),
    );
  }
  const byte = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  for (let i = 0; i < source.data.length; i += 4) {
    const r = curve[source.data[i]] * (1 + plan.warmth);
    const g = curve[source.data[i + 1]];
    const b = curve[source.data[i + 2]] * (1 - plan.warmth);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = byte((y + (r - y) * plan.saturation) * 255);
    out[i + 1] = byte((y + (g - y) * plan.saturation) * 255);
    out[i + 2] = byte((y + (b - y) * plan.saturation) * 255);
    out[i + 3] = source.data[i + 3];
  }
  if (plan.sharpness === 0) return { width, height, data: out };
  const sharp = out.slice();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const at = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const value = out[at + c];
        const blur =
          (out[at - 4 + c] + out[at + 4 + c] + out[at - width * 4 + c] + out[at + width * 4 + c]) /
          4;
        sharp[at + c] = byte(value + Math.max(-6, Math.min(6, (value - blur) * plan.sharpness)));
      }
    }
  return { width, height, data: sharp };
}
