import { z } from "zod";
import { leadSchema } from "./contract";
import { readSite, siteDb, siteEnvironment, SiteUnavailable } from "./service.server";

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
export async function limit(request: Request, category: string, max: number) {
  // Trust only a header set/overwritten by the configured ingress, never arbitrary X-Forwarded-For.
  const trusted = process.env.CORDIAL_SITE_TRUSTED_IP_HEADER;
  const ip = trusted ? (request.headers.get(trusted) ?? "unknown") : "shared";
  const salt = process.env.CORDIAL_SITE_RATE_SECRET;
  if (!salt) throw new SiteUnavailable();
  const bucket = await digest(`${salt}:${category}:${ip}`);
  const { data, error } = await siteDb().rpc("cordial_site_take_rate", {
    _bucket: bucket,
    _limit: max,
    _seconds: 60,
  });
  if (error) throw new SiteUnavailable();
  return data === true;
}
export async function mediaResponse(id: string, version: string, size: string): Promise<Response> {
  if (
    !z.string().uuid().safeParse(id).success ||
    !/^[a-f0-9]{32}$/.test(version) ||
    !["thumb", "card", "full"].includes(size)
  )
    return json({ error: "Imagem não encontrada." }, 404);
  const db = siteDb();
  const { data, error } = await db
    .from("cordial_site_authorized_media")
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
  const { PhotonImage, resize, SamplingFilter } = await import("@cf-wasm/photon");
  const photo = PhotonImage.new_from_byteslice(bytes);
  let resized: InstanceType<typeof PhotonImage> | undefined;
  try {
    if (photo.get_width() * photo.get_height() > 60_000_000)
      return json({ error: "Imagem não disponível." }, 422);
    const width = Math.min(
      size === "thumb" ? 480 : size === "card" ? 960 : 1920,
      photo.get_width(),
    );
    resized = resize(
      photo,
      width,
      Math.max(1, Math.round((photo.get_height() * width) / photo.get_width())),
      SamplingFilter.Lanczos3,
    );
    const output = resized.get_bytes_jpeg(size === "full" ? 88 : 80);
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
  } finally {
    resized?.free();
    photo.free();
  }
}
function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
export async function sitemap() {
  const env = siteEnvironment();
  if (!env.indexable || !env.canonicalOrigin) return new Response("", { status: 404, headers });
  const db = siteDb();
  const urls: string[] = [];
  let cursor: string | undefined;
  while (true) {
    let q = db.from("cordial_site_eligible").select("public_id").order("public_id").limit(500);
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
      .from("cordial_site_pages")
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
  const base = process.env.VITE_CORDIAL_SITE_PUBLIC_HOST ? "" : "/site";
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
export async function handleSiteRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const route = url.pathname.split("/api/cordial-site/")[1] ?? "";
    if (url.search.length > 4000) return json({ error: "Consulta inválida." }, 400);
    if (request.method === "GET") {
      if (route === "bootstrap" && !process.env.SUPABASE_SERVICE_ROLE_KEY)
        return json(await readSite("bootstrap", null));
      if (!(await limit(request, "read", 240)))
        return json({ error: "Muitas consultas. Aguarde um minuto." }, 429);
      if (route === "sitemap.xml") return sitemap();
      if (route.startsWith("media/")) {
        const [, id, version, size, ...rest] = route.split("/");
        if (rest.length) return json({ error: "Não encontrado." }, 404);
        return mediaResponse(id ?? "", version ?? "", size ?? "");
      }
      if (!["bootstrap", "properties", "detail", "detail-state", "pages", "page"].includes(route))
        return json({ error: "Não encontrado." }, 404);
      return json(await readSite(route, JSON.parse(url.searchParams.get("input") ?? "null")));
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
    if (!(await limit(request, "lead", 5)))
      return json({ error: "Aguarde um minuto antes de tentar novamente." }, 429);
    const fingerprint = await digest(
      `${process.env.CORDIAL_SITE_RATE_SECRET}:${lead.phone.replace(/\D/g, "")}:${lead.kind}:${lead.propertyId ?? ""}:${lead.message}`,
    );
    const { data, error } = await siteDb().rpc("cordial_site_submit_lead", {
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
