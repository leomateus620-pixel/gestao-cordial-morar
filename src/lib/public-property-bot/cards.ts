import { getSiteBrand } from "../cordial-site/brand";
import { mediaPath, priceLabel, propertyPath } from "../cordial-site/presentation";
import { propertyUrl, whatsappNumber } from "../cordial-site/experience";
import { sitePublicHost } from "../cordial-site/domains";
import { cardSchema, type BotBrand, type SearchDocument } from "./contracts";
import { botBrand } from "./brand-config";
import { featureEvidence } from "./features";
export function centralContact(
  brand: BotBrand,
  whatsapp: string,
  property?: SearchDocument["property"],
) {
  const number = whatsappNumber(whatsapp);
  if (!number) return `${getSiteBrand(brand).basePath}/contato`;
  const message = property
    ? `Olá! Encontrei o imóvel REF ${property.reference} pelo ${botBrand(brand).name} e gostaria de mais informações. ${propertyUrl(property, `https://${sitePublicHost(brand)}`, brand)}`
    : `Olá! Gostaria de falar com a equipe da ${getSiteBrand(brand).name}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
export function toCard(d: SearchDocument, central: string, differences: string[] = []) {
  const p = d.property;
  const features = (["piscina", "churrasqueira"] as const).flatMap((name) => {
    const title = name === "piscina" ? "Piscina" : "Churrasqueira";
    if (featureEvidence(p, name, "private").state === "present") return [`${title} privativa`];
    if (featureEvidence(p, name, "condominium").state === "present")
      return [`${title} no condomínio`];
    return [];
  });
  return cardSchema.parse({
    id: p.id,
    version: d.version,
    reference: p.reference,
    title: p.type || "Imóvel",
    location: [p.district, p.city].filter(Boolean).join(" · "),
    price: priceLabel(p),
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    features,
    detailPath: propertyPath(p, d.brand),
    imagePath: d.cover ? mediaPath(d.cover, "card", d.brand) : null,
    whatsappUrl: centralContact(d.brand, central, p),
    alternative: differences,
  });
}
