import type { SiteBrand } from "./brand";

// Official public domains per brand. Env vars may override (e.g. staging), otherwise these apply.
export const SITE_PUBLIC_HOSTS: Record<SiteBrand, string> = {
  cordial: "cordialimoveis.com",
  morar: "imobiliariamorarimoveis.com.br",
};

/** Hosts that serve the Gestão; their /site and /site-morar paths move to the brand domain. */
export const GESTAO_HOSTS = ["cordialgestao.com", "www.cordialgestao.com"];

export function sitePublicHost(brand: SiteBrand, override?: string | null) {
  return (override || SITE_PUBLIC_HOSTS[brand]).toLowerCase();
}

/**
 * Permanent redirect target for legacy or www addresses, or null when the request stays put.
 * Never touches /api/ or internal paths.
 */
export function siteDomainRedirect(input: string, hosts = SITE_PUBLIC_HOSTS): string | null {
  const url = new URL(input);
  const host = url.host.toLowerCase();
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_")) return null;
  for (const brand of ["cordial", "morar"] as const) {
    if (host === `www.${hosts[brand]}`)
      return `https://${hosts[brand]}${url.pathname}${url.search}${url.hash}`;
  }
  if (!GESTAO_HOSTS.includes(host)) return null;
  const match = /^\/(site-morar|site)(\/.*)?$/.exec(url.pathname);
  if (!match) return null;
  const brand: SiteBrand = match[1] === "site-morar" ? "morar" : "cordial";
  return `https://${hosts[brand]}${match[2] || "/"}${url.search}${url.hash}`;
}
