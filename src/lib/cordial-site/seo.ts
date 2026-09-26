import type { SiteBootstrap, PublicDetail } from "./contract";
import { locationLabel, mediaPath, propertyPath, priceLabel, plainText } from "./presentation";
import { externalSitePath } from "./routing";
export function siteMatchData(
  matches: readonly { routeId: string; loaderData?: unknown }[],
): SiteBootstrap | undefined {
  return matches.find((m) => m.routeId === "/site")?.loaderData as SiteBootstrap | undefined;
}
export function siteHead(
  title: string,
  description: string,
  data?: SiteBootstrap,
  path = "/site/",
  noindex = false,
  image?: string,
) {
  const canonical = data?.canonicalOrigin ? data.canonicalOrigin + externalSitePath(path) : null;
  return {
    meta: [
      { title: `${title} | Cordial Imóveis` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | Cordial Imóveis` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      {
        name: "robots",
        content: !data?.indexable || noindex ? "noindex, nofollow" : "index, follow",
      },
      { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      ...(image ? [{ property: "og:image", content: image }] : []),
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}
export function detailHead(p: PublicDetail, data?: SiteBootstrap) {
  const title = `${p.type ?? "Imóvel"} ${p.operation === "venda" ? "à venda" : "para alugar"} · ${p.reference}`;
  return siteHead(
    title,
    `${locationLabel(p)}. ${priceLabel(p)}. ${plainText(p.description).slice(0, 130)}`,
    data,
    propertyPath(p),
    false,
    p.cover && data?.canonicalOrigin
      ? data.canonicalOrigin + mediaPath(p.cover, "full")
      : undefined,
  );
}
export function listingJsonLd(p: PublicDetail, origin: string) {
  const url = origin + externalSitePath(propertyPath(p));
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: `${p.type ?? "Imóvel"} ${p.reference}`,
    url,
    description: p.description,
    ...(p.cover ? { image: origin + mediaPath(p.cover, "full") } : {}),
    ...(p.price != null && p.priceMode === "fixo"
      ? {
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: "BRL",
            url,
            ...(p.operation === "aluguel"
              ? {
                  priceSpecification: {
                    "@type": "UnitPriceSpecification",
                    price: p.price,
                    priceCurrency: "BRL",
                    unitText: "mês",
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}
