import { siteDb, siteEnvironment } from "./service.server";
import { limit, sitemap } from "./http.server";
import { siteChannel } from "./channel.server";
import type { SiteBrand } from "./brand";

export function requestSiteBrand(request: Request): SiteBrand | null {
  const url = new URL(request.url);
  // Host has precedence: a public Morar host cannot reach Cordial or administrative APIs.
  for (const brand of ["morar", "cordial"] as const) {
    const channel = siteChannel(brand);
    const host = process.env[`VITE_${channel.envPrefix}_PUBLIC_HOST`]?.toLowerCase();
    if (host && url.host.toLowerCase() === host) return brand;
  }
  for (const brand of ["morar", "cordial"] as const) {
    const channel = siteChannel(brand);
    if (
      url.pathname === channel.base ||
      url.pathname.startsWith(`${channel.base}/`) ||
      url.pathname.startsWith(`${channel.api}/`)
    )
      return brand;
  }
  return null;
}
export function isSiteRequest(request: Request) {
  return requestSiteBrand(request) !== null;
}
export function siteResponseHeaders(brand: SiteBrand = "cordial") {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(!siteEnvironment(brand).indexable ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  };
}
export async function guardSiteRequest(request: Request): Promise<Response | null> {
  const brand = requestSiteBrand(request);
  if (!brand) return null;
  const channel = siteChannel(brand),
    url = new URL(request.url);
  const headers = siteResponseHeaders(brand);
  const publicHost = process.env[`VITE_${channel.envPrefix}_PUBLIC_HOST`]?.toLowerCase();
  const dedicated = !!publicHost && publicHost === url.host.toLowerCase();
  if (url.search.length > 4000)
    return new Response("Consulta muito longa.", { status: 400, headers });
  const password = process.env[`${channel.envPrefix}_PREVIEW_PASSWORD`];
  if (password && process.env[`${channel.envPrefix}_ENV`] !== "production") {
    let supplied = "";
    try {
      supplied = atob((request.headers.get("authorization") ?? "").replace(/^Basic /, ""));
    } catch {
      /* Invalid authorization. */
    }
    const expected = `${brand}:${password}`;
    const a = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)),
    );
    const b = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
    );
    if (a.reduce((n, v, i) => n | (v ^ b[i]), 0) !== 0)
      return new Response("Homologação restrita.", {
        status: 401,
        headers: { ...headers, "WWW-Authenticate": `Basic realm="${brand} homologacao"` },
      });
  }
  if (
    dedicated &&
    ((url.pathname.startsWith("/api/") && !url.pathname.startsWith(`${channel.api}/`)) ||
      url.pathname.startsWith("/_") ||
      (url.pathname.startsWith("/site") &&
        url.pathname !== channel.base &&
        !url.pathname.startsWith(`${channel.base}/`)))
  )
    return new Response("Não encontrado.", { status: 404, headers });
  if (url.pathname.startsWith(`${channel.api}/`)) return null;
  if (["/robots.txt", `${channel.base}/robots.txt`].includes(url.pathname)) {
    const env = siteEnvironment(brand);
    return new Response(
      env.indexable
        ? `User-agent: *\nDisallow: /api/\nDisallow: /_\nSitemap: ${env.canonicalOrigin}${channel.api}/sitemap.xml\n`
        : "User-agent: *\nDisallow: /\n",
      { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      if (!(await limit(request, "html", 120, brand)))
        return new Response("Muitas consultas. Tente novamente em um minuto.", {
          status: 429,
          headers: { ...headers, "Retry-After": "60" },
        });
      if (["/sitemap.xml", `${channel.base}/sitemap.xml`].includes(url.pathname))
        return sitemap(brand);
      const oldPath = url.pathname.startsWith(`${channel.base}/`)
        ? url.pathname.slice(channel.base.length)
        : url.pathname;
      if (/^\/imovel\/\d+\//.test(oldPath)) {
        const db = siteDb();
        const { data, error } = await db
          .from(`${channel.namespace}_redirects`)
          .select("publication_id")
          .eq("old_path", oldPath)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const { data: eligible, error: lookupError } = await db
            .from(`${channel.namespace}_eligible`)
            .select("public_id")
            .eq("public_id", data.publication_id)
            .maybeSingle();
          if (lookupError) throw lookupError;
          if (eligible)
            return Response.redirect(
              `${url.origin}${dedicated ? "" : channel.base}/imovel/${eligible.public_id}`,
              308,
            );
          return new Response(
            "Este imóvel foi retirado do catálogo. Consulte outras opções na busca.",
            { status: 410, headers },
          );
        }
      }
    } catch {
      return new Response(
        "O catálogo está temporariamente indisponível. Tente novamente em instantes.",
        { status: 503, headers },
      );
    }
  }
  return null;
}
