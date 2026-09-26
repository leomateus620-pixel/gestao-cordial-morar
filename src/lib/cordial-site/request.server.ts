import { siteDb, siteEnvironment } from "./service.server";
import { limit, sitemap } from "./http.server";

export function isSiteRequest(request: Request) {
  const url = new URL(request.url),
    host = process.env.VITE_CORDIAL_SITE_PUBLIC_HOST?.toLowerCase();
  return (
    url.pathname === "/site" ||
    url.pathname.startsWith("/site/") ||
    url.pathname.startsWith("/api/cordial-site/") ||
    (!!host && url.host.toLowerCase() === host)
  );
}
export function siteResponseHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(!siteEnvironment().indexable ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  };
}
export async function guardSiteRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.search.length > 4000)
    return new Response("Consulta muito longa.", { status: 400, headers: siteResponseHeaders() });
  const password = process.env.CORDIAL_SITE_PREVIEW_PASSWORD;
  if (password && process.env.CORDIAL_SITE_ENV !== "production") {
    let supplied = "";
    try {
      supplied = atob((request.headers.get("authorization") ?? "").replace(/^Basic /, ""));
    } catch {
      /* Invalid authorization. */
    }
    const expected = `cordial:${password}`;
    const a = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)),
    );
    const b = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
    );
    if (a.reduce((n, v, i) => n | (v ^ b[i]), 0) !== 0)
      return new Response("Homologação restrita.", {
        status: 401,
        headers: {
          ...siteResponseHeaders(),
          "WWW-Authenticate": 'Basic realm="Cordial homologacao"',
        },
      });
  }
  if (url.pathname.startsWith("/api/cordial-site/")) return null;
  if (["/robots.txt", "/site/robots.txt"].includes(url.pathname)) {
    const env = siteEnvironment();
    return new Response(
      env.indexable
        ? `User-agent: *\nDisallow: /api/\nDisallow: /_\nSitemap: ${env.canonicalOrigin}/api/cordial-site/sitemap.xml\n`
        : "User-agent: *\nDisallow: /\n",
      { headers: { ...siteResponseHeaders(), "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  // Keep the public host away from administrative endpoints and server functions.
  if (
    process.env.VITE_CORDIAL_SITE_PUBLIC_HOST?.toLowerCase() === url.host.toLowerCase() &&
    (url.pathname.startsWith("/_") || url.pathname.startsWith("/api/"))
  )
    return new Response("Não encontrado.", { status: 404, headers: siteResponseHeaders() });
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      if (!(await limit(request, "html", 120)))
        return new Response("Muitas consultas. Tente novamente em um minuto.", {
          status: 429,
          headers: { ...siteResponseHeaders(), "Retry-After": "60" },
        });
      if (["/sitemap.xml", "/site/sitemap.xml"].includes(url.pathname)) return sitemap();
      const oldPath = url.pathname.replace(/^\/site(?=\/)/, "");
      if (/^\/imovel\/\d+\//.test(oldPath)) {
        const db = siteDb();
        const { data, error } = await db
          .from("cordial_site_redirects")
          .select("publication_id")
          .eq("old_path", oldPath)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const { data: eligible } = await db
            .from("cordial_site_eligible")
            .select("public_id")
            .eq("public_id", data.publication_id)
            .maybeSingle();
          if (eligible)
            return Response.redirect(
              url.origin +
                (process.env.VITE_CORDIAL_SITE_PUBLIC_HOST?.toLowerCase() === url.host.toLowerCase()
                  ? ""
                  : "/site") +
                "/imovel/" +
                eligible.public_id,
              308,
            );
          return new Response(
            "Este imóvel foi retirado do catálogo. Consulte outras opções na busca.",
            { status: 410, headers: siteResponseHeaders() },
          );
        }
      }
    } catch {
      return new Response(
        "O catálogo está temporariamente indisponível. Tente novamente em instantes.",
        { status: 503, headers: siteResponseHeaders() },
      );
    }
  }
  return null;
}
