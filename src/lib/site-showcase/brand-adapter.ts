import type { SiteBrand } from "@/lib/cordial-site/brand";

/** Per-brand showcase storage: every query, bucket and RPC is scoped to one brand. */
export type ShowcaseAdapter = {
  brand: SiteBrand;
  settings: string;
  weeks: string;
  attempts: string;
  eligible: string;
  media: string;
  bucket: string;
  rpc: { active: string; takeLock: string; releaseLock: string; activate: string };
};

export function showcaseAdapter(brand: SiteBrand): ShowcaseAdapter {
  if (brand !== "cordial" && brand !== "morar") throw new Error("Marca inválida.");
  const ns = `${brand}_site`;
  return {
    brand,
    settings: `${ns}_showcase_settings`,
    weeks: `${ns}_showcase_weeks`,
    attempts: `${ns}_showcase_attempts`,
    eligible: `${ns}_eligible`,
    media: `${ns}_authorized_media`,
    bucket: `${brand}-showcase`,
    rpc: {
      active: `${ns}_showcase_active`,
      takeLock: `${ns}_showcase_take_lock`,
      releaseLock: `${ns}_showcase_release_lock`,
      activate: `${ns}_showcase_activate`,
    },
  };
}
