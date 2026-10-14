import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { photoPathsOf, toPublicSelection, type PublicSelection } from "./public-view";

const BUCKET = "property-images";
const idsSchema = z.object({ ids: z.array(z.string().uuid()).max(100) });

/* eslint-disable @typescript-eslint/no-explicit-any */

async function signPaths(client: any, paths: string[], ttl: number) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await client.storage.from(BUCKET).createSignedUrls(unique, ttl);
  for (const item of (data ?? []) as Array<{ path?: string | null; signedUrl: string }>) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

/** Fotos (só URLs) dos imóveis da página atual, na ordem ativa da galeria. */
export const listCatalogPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsSchema.parse(d))
  .handler(async ({ data, context }): Promise<Record<string, string[]>> => {
    if (!data.ids.length) return {};
    const supabase = context.supabase as any;
    const { data: rows, error } = await supabase
      .from("property_images")
      .select("property_id, storage_path, processed_storage_path, position, pending_remote_delete")
      .in("property_id", data.ids)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const byProperty = new Map<string, string[]>();
    for (const r of (rows ?? []) as Array<any>) {
      if (r.pending_remote_delete) continue;
      const list = byProperty.get(r.property_id) ?? [];
      if (list.length < 30) list.push(r.processed_storage_path ?? r.storage_path);
      byProperty.set(r.property_id, list);
    }
    const signed = await signPaths(supabase, Array.from(byProperty.values()).flat(), 3600);
    const out: Record<string, string[]> = {};
    for (const [id, paths] of byProperty) {
      out[id] = paths.map((p) => signed.get(p)).filter(Boolean) as string[];
    }
    return out;
  });

export type SelectionCandidate = {
  id: string;
  title: string;
  reference: string;
  operation: string | null;
  price: number | null;
  location: string;
  coverUrl: string | null;
  eligible: boolean;
  exists: boolean;
};

/** Dados atuais (preço, disponibilidade) dos imóveis do rascunho. */
export const getSelectionCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsSchema.parse(d))
  .handler(async ({ data, context }): Promise<SelectionCandidate[]> => {
    if (!data.ids.length) return [];
    const supabase = context.supabase as any;
    const [{ data: props, error }, { data: checks, error: e2 }, { data: imgs }] = await Promise.all([
      supabase
        .from("properties")
        .select("id, tipo, codigo, codigo_cordial, codigo_morar, operacao, valor, valor_modo, bairro, cidade")
        .in("id", data.ids),
      supabase.rpc("shared_selection_check", { p_ids: data.ids }),
      supabase
        .from("property_images")
        .select("property_id, storage_path, position")
        .in("property_id", data.ids)
        .eq("position", 0),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    const eligible = new Map((checks ?? []).map((c: any) => [c.property_id, !!c.eligible]));
    const coverPath = new Map<string, string>((imgs ?? []).map((i: any) => [i.property_id, i.storage_path as string]));
    const signed = await signPaths(supabase, Array.from(coverPath.values()), 3600);
    const byId = new Map((props ?? []).map((p: any) => [p.id, p]));
    return data.ids.map((id) => {
      const p: any = byId.get(id);
      if (!p)
        return { id, title: "Imóvel não encontrado", reference: "", operation: null, price: null, location: "", coverUrl: null, eligible: false, exists: false };
      const path = coverPath.get(id);
      return {
        id,
        title: p.tipo ?? "Imóvel",
        reference: [p.codigo_cordial, p.codigo_morar].filter(Boolean).join(" / ") || p.codigo || "",
        operation: p.operacao,
        price: p.valor_modo === "consulte" ? null : p.valor,
        location: [p.bairro, p.cidade].filter(Boolean).join(" · "),
        coverUrl: path ? (signed.get(path) ?? null) : null,
        eligible: Boolean(eligible.get(id)),
        exists: true,
      };
    });
  });

const saveSchema = z.object({
  id: z.string().uuid().nullable(),
  requestId: z.string().min(8).max(80),
  agency: z.enum(["cordial", "morar"]),
  title: z.string().trim().min(1).max(120),
  message: z.string().max(1000),
  clientName: z.string().max(120),
  whatsapp: z.string().regex(/^(\d{10,15})?$/),
  expiresAt: z.string().datetime().nullable(),
  propertyIds: z.array(z.string().uuid()).min(1).max(60),
});

export type SaveSelectionResult =
  | { ok: true; id: string; token: string }
  | { ok: false; error: "vazia" | "limite" | "inelegiveis" | "encerrada"; ineligible?: string[] };

export const saveSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }): Promise<SaveSelectionResult> => {
    const supabase = context.supabase as any;
    const { data: res, error } = await supabase.rpc("shared_selection_save", {
      p_id: data.id,
      p_request_id: data.requestId,
      p_agency: data.agency,
      p_title: data.title,
      p_message: data.message,
      p_client: data.clientName,
      p_whatsapp: data.whatsapp,
      p_expires_at: data.expiresAt,
      p_property_ids: data.propertyIds,
    });
    if (error) throw new Error(error.message === "sem_permissao" ? "Sem permissão para criar seleções." : error.message);
    return res as SaveSelectionResult;
  });

export const closeSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("shared_selection_close", { p_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SelectionRow = {
  id: string;
  agency: "cordial" | "morar";
  title: string;
  public_message: string;
  internal_client_name: string;
  whatsapp: string;
  token: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  corretor_nome: string;
  property_ids: string[];
};

export const listSelections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SelectionRow[]> => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("shared_selections")
      .select("id, agency, title, public_message, internal_client_name, whatsapp, token, status, expires_at, created_at, updated_at, corretor_id, shared_selection_items(property_id, position)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.corretor_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, nome").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((p: any) => [p.id, p.nome ?? ""]));
    return rows.map((r) => ({
      id: r.id,
      agency: r.agency,
      title: r.title,
      public_message: r.public_message,
      internal_client_name: r.internal_client_name,
      whatsapp: r.whatsapp,
      token: r.token,
      status: r.status,
      expires_at: r.expires_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      corretor_nome: (names.get(r.corretor_id) as string) ?? "",
      property_ids: [...(r.shared_selection_items ?? [])]
        .sort((a: any, b: any) => a.position - b.position)
        .map((i: any) => i.property_id),
    }));
  });

/* ---------------- Página pública ---------------- */

export type { PublicSelection, PublicSelectionItem } from "./public-view";

function publicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getPublicSelection = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(128) }).parse(d))
  .handler(async ({ data }): Promise<PublicSelection> => {
    const { getRequestIP, setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store, private");
    setResponseHeader("X-Robots-Tag", "noindex, nofollow");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Limite simples por IP e por token (janela de 1 minuto).
    const ip = getRequestIP({ xForwardedFor: true }) ?? "desconhecido";
    const ipHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sel:${ip}`))),
    )
      .slice(0, 12)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const tokenKey = data.token.slice(0, 64).replace(/[^0-9a-f]/g, "") || "invalido";
    const admin = supabaseAdmin as any;
    const [{ data: ipOk }, { data: tokenOk }] = await Promise.all([
      admin.rpc("shared_selection_take_rate", { _bucket: `ip:${ipHash}`, _limit: 60, _seconds: 60 }),
      admin.rpc("shared_selection_take_rate", { _bucket: `tk:${tokenKey}`, _limit: 120, _seconds: 60 }),
    ]);
    if (ipOk === false || tokenOk === false) return { state: "rate_limited" };
    if (!/^[0-9a-f]{64}$/.test(data.token)) return { state: "invalid" };

    const supa = publicClient() as any;
    const { data: res, error } = await supa.rpc("shared_selection_public", { p_token: data.token });
    if (error) throw new Error("Não foi possível abrir a seleção agora.");
    // Assinatura apenas dos caminhos que a função pública liberou.
    const signed = await signPaths(admin, photoPathsOf(res), 3 * 3600);
    return toPublicSelection(res, signed);
  });
