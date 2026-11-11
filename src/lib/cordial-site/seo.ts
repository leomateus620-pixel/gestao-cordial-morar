import { getSiteBrand, type SiteBrand } from "./brand";
import type { SiteBootstrap, PublicDetail } from "./contract";
import { mediaPath, propertyPath, plainText } from "./presentation";
import { publicSiteUrl, propertyUrl } from "./experience";
import { autoPropertySeo } from "./property-slug";
export function siteMatchData(
  matches: readonly { routeId: string; loaderData?: unknown }[],
  brand: SiteBrand = "cordial",
): SiteBootstrap | undefined {
  return matches.find((m) => m.routeId === getSiteBrand(brand).basePath)?.loaderData as
    | SiteBootstrap
    | undefined;
}
/** Plain single-line text for meta tags: no HTML, arrows, bullets or broken words. */
export function seoText(input: unknown, max = 160): string {
  const text = plainText(input)
    .replace(/[=\-]+>|<[=\-]+|[→←⇒➔➜►▶•●▪◆✓✔]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}
const brandAssets = (brand: SiteBrand) => (brand === "morar" ? "/morar-site" : "/cordial-site");
const themeColor = (brand: SiteBrand) => (brand === "morar" ? "#2f3437" : "#0f4c5c");
export function brandShareImage(data: SiteBootstrap | undefined, brand: SiteBrand) {
  const custom = data?.settings?.socialImageUrl;
  if (custom) return custom;
  return data?.canonicalOrigin
    ? `${data.canonicalOrigin}${brandAssets(brand)}/og-default.jpg`
    : null;
}
export function siteHead(
  title: string,
  description: string,
  data?: SiteBootstrap,
  path = "/site/",
  noindex = false,
  image?: string,
  brand: SiteBrand = "cordial",
  fullTitle = false,
) {
  const canonical = data?.canonicalOrigin ? publicSiteUrl(path, data.canonicalOrigin, brand) : null;
  const name = getSiteBrand(brand).name;
  const pageTitle = fullTitle ? title : `${title} | ${name}`;
  const desc = seoText(description);
  const shareImage = image ?? brandShareImage(data, brand);
  return {
    meta: [
      { title: pageTitle },
      { name: "description", content: desc },
      { property: "og:title", content: pageTitle },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: name },
      { property: "og:locale", content: "pt_BR" },
      {
        name: "robots",
        content: !data?.indexable || noindex ? "noindex, nofollow" : "index, follow",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: pageTitle },
      { name: "twitter:description", content: desc },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      ...(shareImage
        ? [
            { property: "og:image", content: shareImage },
            { property: "og:image:alt", content: `${name} — ${title}` },
            ...(image
              ? []
              : [
                  { property: "og:image:width", content: "1200" },
                  { property: "og:image:height", content: "630" },
                ]),
            { name: "twitter:image", content: shareImage },
          ]
        : []),
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}
/**
 * Brand-wide head for the /site and /site-morar layouts: icons, theme and verification only.
 * Never canonical, og:url or og:image — those belong to each page (TanStack concatenates links).
 */
export function siteLayoutHead(data: SiteBootstrap | undefined, brand: SiteBrand) {
  const dir = brandAssets(brand);
  const s = data?.settings;
  return {
    meta: [
      { name: "theme-color", content: themeColor(brand) },
      ...(s?.googleSiteVerification
        ? [{ name: "google-site-verification", content: s.googleSiteVerification }]
        : []),
      ...(s?.bingSiteVerification
        ? [{ name: "msvalidate.01", content: s.bingSiteVerification }]
        : []),
    ],
    links: [
      { rel: "icon", href: `${dir}/favicon.ico`, sizes: "any" },
      { rel: "icon", type: "image/png", href: `${dir}/icon-192.png`, sizes: "192x192" },
      { rel: "apple-touch-icon", href: `${dir}/apple-touch-icon.png` },
    ],
  };
}
export function homeHead(data: SiteBootstrap | undefined, brand: SiteBrand) {
  const fallback =
    brand === "morar"
      ? {
          title: "Seu próximo lar, mais perto de você",
          description: "Encontre imóveis para comprar ou alugar com a Morar Imóveis.",
        }
      : {
          title: "Sentir-se em casa!",
          description: "Encontre imóveis para comprar ou alugar com a Cordial.",
        };
  const custom = data?.settings?.homeTitle;
  return siteHead(
    custom || fallback.title,
    data?.settings?.homeDescription || fallback.description,
    data,
    brand === "morar" ? "/site-morar/" : "/site/",
    false,
    undefined,
    brand,
    !!custom,
  );
}
export function detailHead(p: PublicDetail, data?: SiteBootstrap, brand: SiteBrand = "cordial") {
  const override = data?.settings?.seoOverrides?.find((o) => o.publicId === p.id);
  const auto = autoPropertySeo(p);
  const title = override?.title || auto.title;
  const description = override?.description || auto.description;
  return siteHead(
    title,
    description,
    data,
    propertyPath(p, brand),
    false,
    p.cover && data?.canonicalOrigin
      ? data.canonicalOrigin + mediaPath(p.cover, "full", brand)
      : undefined,
    brand,
  );
}
/** Trilha Início › Comprar/Alugar › Cidade › Imóvel, nos mesmos endereços oficiais da navegação. */
export function breadcrumbJsonLd(p: PublicDetail, origin: string, brand: SiteBrand = "cordial") {
  const op = p.operation === "venda" ? "Comprar" : "Alugar";
  const search = (q: string) =>
    publicSiteUrl(`${getSiteBrand(brand).basePath}/buscar?${q}`, origin, brand);
  const items = [
    { name: "Início", item: publicSiteUrl(`${getSiteBrand(brand).basePath}/`, origin, brand) },
    { name: op, item: search(`finalidade=${p.operation}`) },
    ...(p.city
      ? [
          {
            name: p.city,
            item: search(`finalidade=${p.operation}&cidade=${encodeURIComponent(p.city)}`),
          },
        ]
      : []),
    { name: `${p.type ?? "Imóvel"} · Ref. ${p.reference}`, item: propertyUrl(p, origin, brand) },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };
}
export function listingJsonLd(p: PublicDetail, origin: string, brand: SiteBrand = "cordial") {
  const url = propertyUrl(p, origin, brand);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: `${p.type ?? "Imóvel"} ${p.reference}`,
    url,
    description: p.description,
    ...(p.cover ? { image: origin + mediaPath(p.cover, "full", brand) } : {}),
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

/** RealEstateAgent JSON-LD built only from the brand's own settings (NAP must match the Google profile). */
export function agentJsonLd(data: SiteBootstrap | undefined, brand: SiteBrand) {
  const st = data?.settings;
  if (!st || !data?.canonicalOrigin) return null;
  const sameAs = [st.instagram, st.facebook, st.youtube, st.tiktok, st.linkedin].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: st.brand || getSiteBrand(brand).name,
    url: `${data.canonicalOrigin}/`,
    logo: `${data.canonicalOrigin}${brandAssets(brand)}/icon-192.png`,
    ...(st.phone ? { telephone: st.phone } : {}),
    ...(st.email ? { email: st.email } : {}),
    ...(st.address ? { address: st.address } : {}),
    ...(st.hours ? { openingHours: st.hours } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
