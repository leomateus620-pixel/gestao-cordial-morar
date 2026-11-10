import { sitePublicHost, SITE_PUBLIC_HOSTS } from "@/lib/cordial-site/domains";

export type SelectionAgency = "cordial" | "morar";

function host(agency: SelectionAgency) {
  const env = agency === "morar"
    ? import.meta.env?.VITE_MORAR_SITE_PUBLIC_HOST
    : import.meta.env?.VITE_CORDIAL_SITE_PUBLIC_HOST;
  return sitePublicHost(agency, env);
}

/** Link enviado ao cliente: sempre no domínio público da marca da seleção. */
export function selectionPublicUrl(token: string, agency: SelectionAgency) {
  return `https://${host(agency)}/s/${token}`;
}

/** Página do imóvel no site da marca. */
export function selectionPropertyUrl(publicId: string, agency: SelectionAgency) {
  return `https://${host(agency)}/imovel/${encodeURIComponent(publicId)}`;
}

/**
 * Para onde mandar quem abriu a seleção fora do domínio da marca; null = fica.
 * Ambiente local e prévia de desenvolvimento ficam onde estão para teste.
 */
export function selectionRedirectTarget(currentUrl: string, agency: SelectionAgency): string | null {
  const url = new URL(currentUrl);
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h.startsWith("id-preview")) return null;
  const want = host(agency);
  if (url.host.toLowerCase() === want) return null;
  return `https://${want}${url.pathname}${url.search}${url.hash}`;
}

export const SELECTION_HOSTS = SITE_PUBLIC_HOSTS;
