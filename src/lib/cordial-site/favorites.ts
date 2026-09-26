export const KEY = "cordial.site.favorites.v1";
export function readFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x) => typeof x === "string" && /^[a-f0-9-]{36}$/.test(x)).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
