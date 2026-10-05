export type SiteBrand = "cordial" | "morar";

const brands = {
  cordial: {
    id: "cordial",
    basePath: "/site",
    apiBase: "/api/cordial-site",
    name: "Cordial Imóveis",
    shortName: "Cordial",
    logo: "/cordial-site/logo.png",
    logoWidth: 691,
    logoHeight: 231,
    themeClass: "cordial-site",
    favoritesKey: "cordial.site.favorites.v1",
    favoritesEvent: "cordial-favorites",
  },
  morar: {
    id: "morar",
    basePath: "/site-morar",
    apiBase: "/api/morar-site",
    name: "Morar Imóveis",
    shortName: "Morar",
    logo: "/morar-site/logo.jpg",
    logoWidth: 728,
    logoHeight: 291,
    themeClass: "cordial-site morar-site",
    favoritesKey: "morar.site.favorites.v1",
    favoritesEvent: "morar-favorites",
  },
} as const;

export function getSiteBrand(brand: SiteBrand = "cordial") {
  if (brand !== "cordial" && brand !== "morar") throw new Error("Marca de site inválida.");
  return brands[brand];
}

export function brandFromPath(path: string): SiteBrand | null {
  if (path === "/site-morar" || path.startsWith("/site-morar/")) return "morar";
  if (path === "/site" || path.startsWith("/site/")) return "cordial";
  return null;
}
