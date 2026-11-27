import { getSiteBrand, type SiteBrand } from "../cordial-site/brand";
import { SITE_PUBLIC_HOSTS } from "../cordial-site/domains";
import type { AudienceAttribution, AudienceConfig, AudienceMenu, AudiencePage } from "./contract";

export type AudienceView = { page: AudiencePage; propertyId?: string; renderKey?: string };

const pages: ReadonlyMap<string, AudiencePage> = new Map([
  ["", "home"],
  ["/comprar", "buy"],
  ["/alugar", "rent"],
  ["/bairros", "districts"],
  ["/contato", "contact"],
  ["/anuncie", "advertise"],
  ["/favoritos", "favorites"],
  ["/sobre", "about"],
  ["/financiamento", "financing"],
  ["/correspondente", "correspondent"],
  ["/privacidade", "privacy"],
]);

export function siteAudiencePage(pathname: string, finalidade: unknown, brand: SiteBrand) {
  const base = getSiteBrand(brand).basePath;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const path = pathname.slice(base.length).replace(/\/+$/, "");
  if (path === "/buscar")
    return finalidade === "venda" ? "buy" : finalidade === "aluguel" ? "rent" : "search";
  if (/^\/imovel\/[^/]+$/.test(path)) return "property";
  if (/^\/noticias(?:\/[^/]+)?$/.test(path)) return "news";
  if (/^\/informacoes\/[^/]+$/.test(path)) return "information";
  if (/^\/selecao(?:\/[^/]+)?$/.test(path)) return "selection";
  return pages.get(path) ?? null;
}

export function siteAudienceMenu(
  pathname: string,
  search: URLSearchParams,
  brand: SiteBrand,
): AudienceMenu | null {
  const page = siteAudiencePage(pathname, search.get("finalidade"), brand);
  return page === "information" || page === "property" || page === "privacy" ? null : page;
}

const shortLabel = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const domainPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeCampaignLabel(input: string | null) {
  const label = input?.toLowerCase().trim() ?? "";
  return label.length <= 48 && shortLabel.test(label) ? label : undefined;
}

function generalizeReferrer(input: string, page: URL, brand: SiteBrand) {
  if (!input) return undefined;
  try {
    const referrer = new URL(input);
    const domain = referrer.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
    const ownHost = page.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
    if (!["http:", "https:"].includes(referrer.protocol) || domain.length > 253) return undefined;
    if (domain === ownHost || domain === SITE_PUBLIC_HOSTS[brand]) return undefined;
    if (!domainPattern.test(domain) || /\.(localhost|local|test|invalid|internal)$/.test(domain))
      return undefined;
    return domain;
  } catch {
    return undefined;
  }
}

/** Reads only approved campaign values, at the moment a consented document enters measurement. */
export function audienceAttribution(
  page: URL,
  referrer: string,
  brand: SiteBrand,
  config: Pick<AudienceConfig, "pairs" | "campaigns">,
): AudienceAttribution | undefined {
  const value = (name: string) => {
    const values = page.searchParams.getAll(name);
    return values.length === 1 ? normalizeCampaignLabel(values[0]) : undefined;
  };
  const source = value("utm_source");
  const medium = value("utm_medium");
  const campaign = value("utm_campaign");
  const referrerDomain = generalizeReferrer(referrer, page, brand);
  if (
    source &&
    medium &&
    config.pairs?.some((pair) => pair.source === source && pair.medium === medium)
  )
    return {
      source,
      medium,
      ...(campaign && config.campaigns?.includes(campaign) ? { campaign } : {}),
      ...(referrerDomain ? { referrerDomain } : {}),
    };
  return referrerDomain ? { referrerDomain } : undefined;
}
