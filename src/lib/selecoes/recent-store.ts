import { getSiteBrand, type SiteBrand } from "@/lib/cordial-site/brand";
import { normalizePublicIds, pushRecentProperty, RECENT_PROPERTIES_LIMIT } from "./visitor-rules";

const key = (brand: SiteBrand) => `${getSiteBrand(brand).basePath}:recent:v1`;
export const RECENT_PROPERTIES_EVENT = "cordial:recent-properties";
export function readRecentProperties(brand: SiteBrand = "cordial"): string[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizePublicIds(
      JSON.parse(localStorage.getItem(key(brand)) ?? "[]"),
      RECENT_PROPERTIES_LIMIT,
    );
  } catch {
    return [];
  }
}
export function rememberPublicProperty(id: string, brand: SiteBrand = "cordial") {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      key(brand),
      JSON.stringify(pushRecentProperty(readRecentProperties(brand), id)),
    );
    window.dispatchEvent(new Event(RECENT_PROPERTIES_EVENT));
  } catch {
    /* An optional local history must never block the property. */
  }
}
export function removeRecentProperty(id: string | null, brand: SiteBrand = "cordial") {
  if (typeof window === "undefined") return;
  try {
    const next = id === null ? [] : readRecentProperties(brand).filter((value) => value !== id);
    localStorage.setItem(key(brand), JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_PROPERTIES_EVENT));
  } catch {
    /* The visitor can continue without local storage. */
  }
}
