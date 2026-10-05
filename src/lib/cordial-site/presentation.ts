import { decodeHTML } from "entities";
import type { PublicProperty, PublicMedia } from "./contract";
import { getSiteBrand, type SiteBrand } from "./brand";
export const SITE_BASE = "/site";
export const sitePath = (path = "", brand: SiteBrand = "cordial") =>
  `${getSiteBrand(brand).basePath}${path}`;
export const propertyPath = (p: Pick<PublicProperty, "id">, brand: SiteBrand = "cordial") =>
  sitePath(`/imovel/${p.id}`, brand);
export const mediaPath = (
  m: PublicMedia,
  size: "thumb" | "card" | "full" = "card",
  brand: SiteBrand = "cordial",
) => `${getSiteBrand(brand).apiBase}/media/${m.id}/${m.version}/${size}`;
export const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function priceLabel(p: Pick<PublicProperty, "price" | "priceMode" | "operation">) {
  return p.priceMode === "consulte"
    ? "Valor sob consulta"
    : p.price == null
      ? "Valor não informado"
      : `${money(p.price)}${p.operation === "aluguel" ? " / mês" : ""}`;
}
export const locationLabel = (p: Pick<PublicProperty, "district" | "city" | "state">) =>
  [p.district, [p.city, p.state].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
export const areaLabels = {
  util: "Área útil",
  total: "Área total",
  construida: "Área construída",
  terreno: "Área do terreno",
};
export const areaLabel = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
export function plainText(input: unknown): string {
  if (typeof input !== "string") return "";
  return decodeHTML(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
