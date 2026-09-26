// Optional, host-scoped activation. Empty by default: Gestão keeps every current route.
export const publicRootHost = import.meta.env?.VITE_CORDIAL_SITE_PUBLIC_HOST?.toLowerCase() ?? "";
export function rewritePublicInput(url: URL, host = publicRootHost) {
  if (
    !host ||
    url.host.toLowerCase() !== host ||
    url.pathname.startsWith("/site") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_")
  )
    return;
  const next = new URL(url);
  next.pathname = `/site${url.pathname}`;
  return next;
}
export function rewritePublicOutput(url: URL, host = publicRootHost) {
  if (
    !host ||
    url.host.toLowerCase() !== host ||
    !(url.pathname === "/site" || url.pathname.startsWith("/site/"))
  )
    return;
  const next = new URL(url);
  next.pathname = url.pathname.slice(5) || "/";
  return next;
}
export function externalSitePath(path: string) {
  return publicRootHost && (path === "/site" || path.startsWith("/site/"))
    ? path.slice(5) || "/"
    : path;
}
