import { propertySlug } from "./property-slug";
import { siteDb, siteEnvironment } from "./service.server";
import { limit, sitemap } from "./http.server";
import { siteChannel } from "./channel.server";
import type { SiteBrand } from "./brand";
import { sitePublicHost } from "./domains";

export function requestSiteBrand(request: Request): SiteBrand | null {
  const url = new URL(request.url);
  // Host has precedence: a public Morar host cannot reach Cordial or administrative APIs.
  for (const brand of ["morar", "cordial"] as const) {
    const channel = siteChannel(brand);
    const host = sitePublicHost(brand, process.env[`VITE_${channel.envPrefix}_PUBLIC_HOST`]);
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
  const publicHost = sitePublicHost(brand, process.env[`VITE_${channel.envPrefix}_PUBLIC_HOST`]);
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
  if (["/robots.txt", `${channel.base}/robots.txt`].includes(url.pathname))
    return new Response(robotsTxt(brand), {
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  if (
    dedicated &&
    url.pathname === "/favicon.ico" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    // The Gestão keeps public/favicon.ico; brand hosts get their own icon.
    const icon = new URL(`/${brand === "morar" ? "morar-site" : "cordial-site"}/favicon.ico`, url);
    return Response.redirect(icon.toString(), 301);
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const sitePath = url.pathname.startsWith(`${channel.base}/`)
        ? url.pathname.slice(channel.base.length)
        : url.pathname;
      const legacyId =
        request.method === "GET" || request.method === "HEAD" ? legacyImobiId(sitePath) : null;
      const isSitemap = ["/sitemap.xml", `${channel.base}/sitemap.xml`].includes(url.pathname);
      if (!(await limit(request, "html", 120, brand)))
        return new Response("Muitas consultas. Tente novamente em um minuto.", {
          status: 429,
          headers: { ...headers, "Retry-After": "60" },
        });
      if (isSitemap) return sitemap(brand);
      if (!legacyId) return null;
      if (legacyId) {
        const target = await resolveLegacy(brand, sitePath, legacyId);
        if (target?.state === "eligible") {
          const origin = dedicated ? `https://${publicHost}` : `${url.origin}${channel.base}`;
          return new Response(null, {
            status: 301,
            headers: {
              ...headers,
              Location: `${origin}/imovel/${await slugFor(brand, target.publicId)}`,
            },
          });
        }
        if (target?.state === "withdrawn")
          return new Response(
            withdrawnPage(brand, dedicated ? "/buscar" : `${channel.base}/buscar`),
            {
              status: 410,
              headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
            },
          );
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

/** Numeric ImobiBrasil id from /imovel/{id}, /imovel/{id}/ or /imovel/{id}/{slug}; never a UUID. */
export function legacyImobiId(path: string): string | null {
  return /^\/imovel\/(\d{3,10})(?:\/[^?#]*)?$/.exec(path)?.[1] ?? null;
}

export function robotsTxt(brand: SiteBrand): string {
  const env = siteEnvironment(brand);
  const channel = siteChannel(brand);
  if (!env.indexable) return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    `Allow: ${channel.api}/media/`,
    `Allow: ${channel.api}/sitemap.xml`,
    "Disallow: /api/",
    "Disallow: /_",
    `Sitemap: ${env.canonicalOrigin}${channel.api}/sitemap.xml`,
    "",
  ].join("\n");
}

/** Endereço amigável atual do imóvel, para que o 301 vá direto ao destino final (um salto só). */
async function slugFor(brand: SiteBrand, publicId: string): Promise<string> {
  const { data } = await siteDb()
    .from(`${siteChannel(brand).namespace}_eligible`)
    .select("public_id,public_reference,operacao,tipo,cidade,bairro,dormitorios")
    .eq("public_id", publicId)
    .maybeSingle();
  if (!data) return publicId;
  return propertySlug({
    id: data.public_id,
    reference: data.public_reference,
    operation: data.operacao,
    type: data.tipo,
    city: data.cidade,
    district: data.bairro,
    bedrooms: data.dormitorios,
  });
}

async function resolveLegacy(
  brand: SiteBrand,
  path: string,
  imobiId: string,
): Promise<{ publicId: string; state: "eligible" | "withdrawn" } | null> {
  const channel = siteChannel(brand);
  const db = siteDb();
  // Manual override first (admin-confirmed), then automatic resolution by the brand's own Imobi id.
  const normalized = path.replace(/\/+$/, "");
  const { data: manual, error } = await db
    .from(`${channel.namespace}_redirects`)
    .select("publication_id")
    .in("old_path", [normalized, `${normalized}/`])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (manual) {
    const { data: eligible, error: e2 } = await db
      .from(`${channel.namespace}_eligible`)
      .select("public_id")
      .eq("public_id", manual.publication_id)
      .maybeSingle();
    if (e2) throw e2;
    return { publicId: manual.publication_id, state: eligible ? "eligible" : "withdrawn" };
  }
  const { data, error: rpcError } = await db.rpc(`${channel.namespace}_resolve_legacy`, {
    _imobi_id: imobiId,
  });
  // Resolver not deployed yet: behave as an unknown address (normal 404), never a 503.
  if (rpcError) return null;
  const row = (data as { public_id: string; state: string }[] | null)?.[0];
  if (!row?.public_id) return null;
  return { publicId: row.public_id, state: row.state === "eligible" ? "eligible" : "withdrawn" };
}

function withdrawnPage(brand: SiteBrand, searchHref: string) {
  const name = brand === "morar" ? "Morar Imóveis" : "Cordial Imóveis";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Imóvel retirado do catálogo | ${name}</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 24px;line-height:1.5}a{display:inline-block;margin-top:12px;padding:10px 18px;border:1px solid currentColor;border-radius:8px;color:inherit;text-decoration:none}</style></head><body><h1>Imóvel retirado do catálogo</h1><p>Este imóvel não está mais disponível na ${name}. Veja outras opções na busca.</p><a href="${searchHref}">Ver imóveis disponíveis</a></body></html>`;
}
