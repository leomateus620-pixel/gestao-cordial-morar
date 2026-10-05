import { getSiteBrand, type SiteBrand } from "./brand";

// Activation stays explicit and host-scoped; neither namespace moves on the Gestão host.

export const publicRootHost = import.meta.env?.VITE_CORDIAL_SITE_PUBLIC_HOST?.toLowerCase() ?? "";

export const morarPublicRootHost =
  import.meta.env?.VITE_MORAR_SITE_PUBLIC_HOST?.toLowerCase() ?? "";

function activation(url: URL, host?: string, brand: SiteBrand = "cordial") {
  if (host !== undefined) return { host, brand };

  if (morarPublicRootHost && url.host.toLowerCase() === morarPublicRootHost)
    return { host: morarPublicRootHost, brand: "morar" as const };

  return { host: publicRootHost, brand };
}

export function rewritePublicInput(url: URL, host?: string, brand: SiteBrand = "cordial") {
  const target = activation(url, host, brand);

  if (
    !target.host ||
    url.host.toLowerCase() !== target.host ||
    url.pathname.startsWith("/site") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_")
  )
    return;

  const next = new URL(url);

  next.pathname = `${getSiteBrand(target.brand).basePath}${url.pathname}`;

  return next;
}

export function rewritePublicOutput(url: URL, host?: string, brand: SiteBrand = "cordial") {
  const target = activation(url, host, brand);

  const base = getSiteBrand(target.brand).basePath;

  if (
    !target.host ||
    url.host.toLowerCase() !== target.host ||
    !(url.pathname === base || url.pathname.startsWith(`${base}/`))
  )
    return;

  const next = new URL(url);

  next.pathname = url.pathname.slice(base.length) || "/";

  return next;
}

export function externalSitePath(path: string, brand: SiteBrand = "cordial") {
  const host = brand === "morar" ? morarPublicRootHost : publicRootHost;

  const base = getSiteBrand(brand).basePath;

  return host && (path === base || path.startsWith(`${base}/`))
    ? path.slice(base.length) || "/"
    : path;
}
