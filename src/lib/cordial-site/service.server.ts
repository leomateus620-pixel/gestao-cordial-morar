import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  publicPropertySchema,
  mediaSchema,
  searchSchema,
  settingsSchema,
  publicFacetsSchema,
  type SiteBootstrap,
  type SiteCatalog,
  type PublicDetail,
  type SiteFacets,
  type SitePage,
} from "./contract";
import { plainText } from "./presentation";
import type { SiteBrand } from "./brand";
import { siteChannel, siteDefaultSettings } from "./channel.server";

export class SiteUnavailable extends Error {
  constructor() {
    super("O serviço está temporariamente indisponível.");
  }
}
// Separate client: no session, persistence or caller-controlled bearer token.
export function siteDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SiteUnavailable();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        return fetch(input, {
          ...init,
          headers,
          signal: init?.signal ?? AbortSignal.timeout(15000),
        });
      },
    },
  });
}
export const emptyFacets: SiteFacets = {
  total: 0,
  types: [],
  cities: [],
  districts: [],
  stages: [],
};
export function siteEnvironment(brand: SiteBrand = "cordial") {
  const channel = siteChannel(brand);
  let canonicalOrigin: string | null = null;
  try {
    const url = new URL(process.env[`${channel.envPrefix}_CANONICAL_ORIGIN`] ?? "");
    if (url.protocol === "https:" && url.pathname === "/" && !url.username && !url.password)
      canonicalOrigin = url.origin;
  } catch {
    /* Unconfigured previews must not invent canonical URLs. */
  }
  return {
    canonicalOrigin,
    indexable: process.env[`${channel.envPrefix}_ENV`] === "production" && !!canonicalOrigin,
  };
}
export async function bootstrap(brand: SiteBrand = "cordial"): Promise<SiteBootstrap> {
  const channel = siteChannel(brand);
  try {
    const db = siteDb();
    const [settings, facets] = await Promise.all([
      db.from(`${channel.namespace}_settings`).select("content").eq("id", true).single(),
      db.rpc(`${channel.namespace}_facets`),
    ]);
    if (settings.error || facets.error) throw new SiteUnavailable();
    return {
      settings: settingsSchema.parse({ ...siteDefaultSettings(brand), ...settings.data.content }),
      facets: publicFacetsSchema.parse(facets.data),
      available: true,
      ...siteEnvironment(brand),
    };
  } catch {
    return {
      settings: siteDefaultSettings(brand),
      facets: emptyFacets,
      available: false,
      ...siteEnvironment(brand),
    };
  }
}
export async function catalog(input: unknown, brand: SiteBrand = "cordial"): Promise<SiteCatalog> {
  const f = searchSchema.parse(input);
  const { data, error } = await siteDb().rpc(`${siteChannel(brand).namespace}_search`, { f });
  if (error || !data) throw new SiteUnavailable();
  return {
    items: z.array(publicPropertySchema).parse(data.items),
    total: z.number().int().nonnegative().parse(data.total),
    page: f.pagina,
    pageSize: 12,
  };
}
export async function detail(
  id: string,
  brand: SiteBrand = "cordial",
): Promise<PublicDetail | null> {
  const channel = siteChannel(brand);
  if (!z.string().uuid().safeParse(id).success) return null;
  const db = siteDb();
  const { data, error } = await db
    .from(`${channel.namespace}_documents`)
    .select("document")
    .eq("public_id", id)
    .maybeSingle();
  if (error) throw new SiteUnavailable();
  if (!data) return null;
  const { data: media, error: mediaError } = await db
    .from(`${channel.namespace}_authorized_media`)
    .select("id,version,width,height,position")
    .eq("public_id", id)
    .order("position")
    .order("id");
  if (mediaError) throw new SiteUnavailable();
  const item = publicPropertySchema.parse(data.document);
  // Content is rendered as text, never trusted HTML. It was approved against its current hash.
  return {
    ...item,
    description: plainText(item.description),
    features: item.features.map(plainText),
    images: z.array(mediaSchema).parse(media ?? []),
  };
}
export async function detailState(
  id: string,
  brand: SiteBrand = "cordial",
): Promise<"withdrawn" | "unavailable" | "missing"> {
  if (!z.string().uuid().safeParse(id).success) return "missing";
  const { data, error } = await siteDb()
    .from(`${siteChannel(brand).namespace}_publications`)
    .select("state,published_at")
    .eq("public_id", id)
    .maybeSingle();
  if (error) throw new SiteUnavailable();
  if (!data?.published_at) return "missing";
  return data.state === "withdrawn" ? "withdrawn" : "unavailable";
}
export async function pages(kind?: string, brand: SiteBrand = "cordial"): Promise<SitePage[]> {
  const db = siteDb();
  let q = db
    .from(`${siteChannel(brand).namespace}_pages`)
    .select("slug,kind,title,summary,body,published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .order("slug")
    .limit(100);
  if (kind) q = q.eq("kind", z.enum(["page", "news", "district"]).parse(kind));
  const { data, error } = await q;
  if (error) throw new SiteUnavailable();
  return (data ?? []).map((p) => ({
    slug: p.slug,
    kind: p.kind,
    title: plainText(p.title),
    summary: plainText(p.summary),
    body: plainText(p.body),
    publishedAt: p.published_at,
  }));
}
export async function page(slug: string, brand: SiteBrand = "cordial"): Promise<SitePage | null> {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const { data, error } = await siteDb()
    .from(`${siteChannel(brand).namespace}_pages`)
    .select("slug,kind,title,summary,body,published_at")
    .eq("published", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new SiteUnavailable();
  if (!data) return null;
  return {
    slug: data.slug,
    kind: data.kind,
    title: plainText(data.title),
    summary: plainText(data.summary),
    body: plainText(data.body),
    publishedAt: data.published_at,
  };
}
export async function readSite(
  resource: string,
  input: unknown,
  brand: SiteBrand = "cordial",
): Promise<unknown> {
  siteChannel(brand);
  switch (resource) {
    case "detail-state":
      return detailState(z.string().parse(input), brand);
    case "bootstrap":
      return bootstrap(brand);
    case "properties":
      return catalog(input, brand);
    case "detail":
      return detail(z.string().parse(input), brand);
    case "pages":
      return pages(typeof input === "string" ? input : undefined, brand);
    case "page":
      return page(z.string().parse(input), brand);
    default:
      throw new Error("Unknown public resource");
  }
}
