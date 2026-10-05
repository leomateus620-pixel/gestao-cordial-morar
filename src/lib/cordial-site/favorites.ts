import { getSiteBrand, type SiteBrand } from "./brand";
export const KEY = "cordial.site.favorites.v1";
export function readFavorites(brand: SiteBrand = "cordial"): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(getSiteBrand(brand).favoritesKey) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x) => typeof x === "string" && /^[a-f0-9-]{36}$/.test(x)).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
