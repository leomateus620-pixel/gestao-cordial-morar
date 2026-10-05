import { z } from "zod";
import { leadSchema } from "./contract";
import { readSite, siteDb, siteEnvironment, SiteUnavailable } from "./service.server";
import type { SiteBrand } from "./brand";
import { siteChannel } from "./channel.server";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Robots-Tag": "noindex, nofollow",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
class PayloadTooLarge extends Error {}
async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0,
    body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 10000) {
        await reader.cancel();
        throw new PayloadTooLarge();
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function limit(
  request: Request,
  category: string,
  max: number,
  brand: SiteBrand = "cordial",
) {
  const channel = siteChannel(brand);
  // Trust only a header set/overwritten by the configured ingress, never arbitrary X-Forwarded-For.
  const trusted = process.env[`${channel.envPrefix}_TRUSTED_IP_HEADER`];
  const ip = trusted ? (request.headers.get(trusted) ?? "unknown") : "shared";
  const salt = process.env[`${channel.envPrefix}_RATE_SECRET`];
  if (!salt) throw new SiteUnavailable();
  const bucket = await digest(`${salt}:${category}:${ip}`);
  const { data, error } = await siteDb().rpc(`${channel.namespace}_take_rate`, {
    _bucket: bucket,
    _limit: max,
    _seconds: 60,
  });
  if (error) throw new SiteUnavailable();
  return data === true;
}
export async function mediaResponse(
  id: string,
  version: string,
  size: string,
  brand: SiteBrand = "cordial",
): Promise<Response> {
  if (
    !z.string().uuid().safeParse(id).success ||
    !/^[a-f0-9]{32}$/.test(version) ||
    !["thumb", "card", "full"].includes(size)
  )
    return json({ error: "Imagem não encontrada." }, 404);
  const db = siteDb();
  const { data, error } = await db
    .from(`${siteChannel(brand).namespace}_authorized_media`)
    .select("storage_path,width,height")
    .eq("id", id)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new SiteUnavailable();
  if (!data) return json({ error: "Imagem não disponível." }, 404);
  const { data: blob, error: storageError } = await db.storage
    .from("property-images")
    .download(data.storage_path);
  if (storageError || !blob) return json({ error: "Imagem temporariamente indisponível." }, 503);
  if (blob.size > 25 * 1024 * 1024) return json({ error: "Imagem não disponível." }, 422);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Pure JS: the published runtime cannot load the Photon WASM module.
  const { decodeRaster, resizeRaster, encodeJpeg } =
    await import("@/lib/imoveis/watermark-purejs.server");
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";
  let photo;
  try {
    photo = decodeRaster(bytes, type);
  } catch {
    return json({ error: "Imagem não disponível." }, 422);
  }
  if (photo.width * photo.height > 60_000_000)
    return json({ error: "Imagem não disponível." }, 422);
  const width = Math.min(size === "thumb" ? 480 : size === "card" ? 960 : 1920, photo.width);
  const resized =
    width === photo.width
      ? photo
      : resizeRaster(photo, width, Math.max(1, Math.round((photo.height * width) / photo.width)));
  const output = encodeJpeg(resized, size === "full" ? 88 : 80);
  // A withdrawal or image revision may happen while downloading/encoding. Check
  // the same channel object again before releasing any bytes to the visitor.
  const { data: stillAuthorized, error: authorizationError } = await db
    .from(`${siteChannel(brand).namespace}_authorized_media`)
    .select("id")
    .eq("id", id)
    .eq("version", version)
    .maybeSingle();
  if (authorizationError) throw new SiteUnavailable();
  if (!stillAuthorized) return json({ error: "Imagem não disponível." }, 404);
  // Re-encoding strips EXIF/GPS. No new watermark is applied to an already approved image.
  return new Response(new Blob([new Uint8Array(output)], { type: "image/jpeg" }), {
    headers: {
      ...headers,
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=30, must-revalidate",
      "Content-Disposition": "inline",
      ETag: `"${version}-${size}"`,
    },
  });
}
function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
export async function sitemap(brand: SiteBrand = "cordial") {
  const channel = siteChannel(brand);
  const env = siteEnvironment(brand);
  if (!env.indexable || !env.canonicalOrigin) return new Response("", { status: 404, headers });
  const db = siteDb();
  const urls: string[] = [];
  let cursor: string | undefined;
  while (true) {
    let q = db
      .from(`${channel.namespace}_eligible`)
      .select("public_id")
      .order("public_id")
      .limit(500);
    if (cursor) q = q.gt("public_id", cursor);
    const { data, error } = await q;
    if (error) throw new SiteUnavailable();
    if (!data?.length) break;
    urls.push(...data.map((p) => `/imovel/${p.public_id}`));
    cursor = data.at(-1)!.public_id;
  }
  let pageCursor: string | undefined;
  while (true) {
    let q = db
      .from(`${channel.namespace}_pages`)
      .select("slug,kind")
      .eq("published", true)
      .order("slug")
      .limit(500);
    if (pageCursor) q = q.gt("slug", pageCursor);
    const { data, error } = await q;
    if (error) throw new SiteUnavailable();
    if (!data?.length) break;
    urls.push(
      ...data.map((p) => (p.kind === "news" ? `/noticias/${p.slug}` : `/informacoes/${p.slug}`)),
    );
    pageCursor = data.at(-1)!.slug;
  }
  const base = process.env[`VITE_${channel.envPrefix}_PUBLIC_HOST`] ? "" : channel.base;
  const paths = [
    "/",
    "/bairros",
    "/sobre",
    "/contato",
    "/financiamento",
    "/correspondente",
    "/noticias",
    ...urls,
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${xml(env.canonicalOrigin! + base + p)}</loc></url>`).join("")}</urlset>`,
    { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" } },
  );
}
export async function handleSiteRequest(
  request: Request,
  brand: SiteBrand = "cordial",
): Promise<Response> {
  const channel = siteChannel(brand);
  try {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${channel.api}/`)) return json({ error: "Não encontrado." }, 404);
    const route = url.pathname.slice(channel.api.length + 1);
    if (url.search.length > 4000) return json({ error: "Consulta inválida." }, 400);
    if (request.method === "GET") {
      if (route === "bootstrap" && !process.env.SUPABASE_SERVICE_ROLE_KEY)
        return json(await readSite("bootstrap", null, brand));
      if (!(await limit(request, "read", 240, brand)))
        return json({ error: "Muitas consultas. Aguarde um minuto." }, 429);
      if (route === "sitemap.xml") return sitemap(brand);
      if (route.startsWith("media/")) {
        const [, id, version, size, ...rest] = route.split("/");
        if (rest.length) return json({ error: "Não encontrado." }, 404);
        return mediaResponse(id ?? "", version ?? "", size ?? "", brand);
      }
      if (!["bootstrap", "properties", "detail", "detail-state", "pages", "page"].includes(route))
        return json({ error: "Não encontrado." }, 404);
      return json(
        await readSite(route, JSON.parse(url.searchParams.get("input") ?? "null"), brand),
      );
    }
    if (request.method !== "POST" || route !== "leads")
      return json({ error: "Método não permitido." }, 405);
    const origin = request.headers.get("Origin");
    if (!origin || origin !== url.origin) return json({ error: "Origem inválida." }, 403);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return json({ error: "Formato inválido." }, 415);
    if (Number(request.headers.get("Content-Length") ?? 0) > 10000)
      return json({ error: "Mensagem muito longa." }, 413);
    const body = await readBoundedBody(request);
    if (body.length > 10000) return json({ error: "Mensagem muito longa." }, 413);
    const lead = leadSchema.parse(JSON.parse(body));
    if (!(await limit(request, "lead", 5, brand)))
      return json({ error: "Aguarde um minuto antes de tentar novamente." }, 429);
    const fingerprint = await digest(
      `${process.env[`${channel.envPrefix}_RATE_SECRET`]}:${lead.phone.replace(/\D/g, "")}:${lead.kind}:${lead.propertyId ?? ""}:${lead.message}`,
    );
    const { data, error } = await siteDb().rpc(`${channel.namespace}_submit_lead`, {
      _lead: lead,
      _fingerprint: fingerprint,
    });
    if (error || data !== "received") throw new SiteUnavailable();
    return json(
      { ok: true, message: "Recebemos sua mensagem. Nossa equipe dará continuidade ao contato." },
      201,
    );
  } catch (error) {
    if (error instanceof PayloadTooLarge) return json({ error: "Mensagem muito longa." }, 413);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Confira os campos informados e tente novamente." }, 400);
    // Never log payloads, owners, storage paths, credentials or arbitrary database errors.
    return json(
      {
        error: "O serviço está temporariamente indisponível. Sua mensagem permanece no formulário.",
      },
      503,
    );
  }
}
