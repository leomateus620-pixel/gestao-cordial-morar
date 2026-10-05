import { z } from "zod";
import type { SiteBrand } from "./brand";
import { settingsSchema } from "./contract";

// These identifiers are selected by the route, never interpolated from visitor input.
export function siteChannel(brand: SiteBrand = "cordial") {
  const id = z.enum(["cordial", "morar"]).parse(brand);
  return id === "morar"
    ? {
        id,
        namespace: "morar_site",
        envPrefix: "MORAR_SITE",
        base: "/site-morar",
        api: "/api/morar-site",
      }
    : {
        id,
        namespace: "cordial_site",
        envPrefix: "CORDIAL_SITE",
        base: "/site",
        api: "/api/cordial-site",
      };
}

export function siteDefaultSettings(brand: SiteBrand = "cordial") {
  return settingsSchema.parse(
    brand === "morar"
      ? { brand: "Morar Imóveis", tagline: "Nós temos a chave da sua felicidade!" }
      : {},
  );
}
