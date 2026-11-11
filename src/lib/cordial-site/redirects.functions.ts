import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseRedirectCsv, previewRedirects, applicable, normalizeOldPath } from "./redirect-import";

const brandSchema = z.enum(["cordial", "morar"]);
async function requireAdmin(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Acesso restrito à administração.");
}
const other = (b: "cordial" | "morar") => (b === "cordial" ? "morar" : "cordial");

async function references(db: SupabaseClient, brand: "cordial" | "morar") {
  const map = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(`${brand}_site_eligible`)
      .select("public_id,public_reference")
      .order("public_id")
      .range(from, from + 999);
    if (error) throw new Error("Não foi possível ler os imóveis publicados.");
    for (const r of data ?? []) if (r.public_reference) map.set(String(r.public_reference).toLowerCase(), r.public_id);
    if (!data || data.length < 1000) return map;
  }
}

async function existingRedirects(db: SupabaseClient, brand: "cordial" | "morar") {
  const { data, error } = await db
    .from(`${brand}_site_redirects`)
    .select("old_path,publication_id,confirmed_at")
    .order("old_path")
    .limit(5000);
  if (error) throw new Error("Não foi possível ler os redirecionamentos.");
  return data ?? [];
}

export const listSiteRedirects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brand: brandSchema }).parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const { siteDb } = await import("./service.server");
    const db = siteDb();
    const [rows, refs] = await Promise.all([existingRedirects(db, data.brand), references(db, data.brand)]);
    const byId = new Map([...refs].map(([ref, id]) => [id, ref]));
    return rows.map((r) => ({
      oldPath: r.old_path as string,
      publicId: r.publication_id as string,
      reference: byId.get(r.publication_id) ?? null,
      confirmedAt: r.confirmed_at as string | null,
    }));
  });

const csvInput = z.object({ brand: brandSchema, csv: z.string().max(400_000) });

export const previewSiteRedirects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => csvInput.parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const { siteDb } = await import("./service.server");
    const db = siteDb();
    const [own, others, existing] = await Promise.all([
      references(db, data.brand),
      references(db, other(data.brand)),
      existingRedirects(db, data.brand),
    ]);
    const onlyOther = new Set([...others.keys()].filter((r) => !own.has(r)));
    return previewRedirects(
      parseRedirectCsv(data.csv),
      own,
      onlyOther,
      new Set(existing.map((e) => e.old_path as string)),
    );
  });

export const applySiteRedirects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => csvInput.parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const { siteDb } = await import("./service.server");
    const db = siteDb();
    // Recalcula a prévia no servidor: nunca confia em ids enviados pelo navegador.
    const [own, existing] = await Promise.all([references(db, data.brand), existingRedirects(db, data.brand)]);
    const rows = applicable(
      previewRedirects(parseRedirectCsv(data.csv), own, new Set(), new Set(existing.map((e) => e.old_path as string))),
    );
    if (!rows.length) return { applied: 0 };
    const now = new Date().toISOString();
    const { error } = await db.from(`${data.brand}_site_redirects`).upsert(
      rows.map((r) => ({
        old_path: r.oldPath!,
        publication_id: r.publicId!,
        confirmed_by: context.userId,
        confirmed_at: now,
      })),
      { onConflict: "old_path" },
    );
    if (error) throw new Error("Não foi possível salvar os redirecionamentos.");
    return { applied: rows.length };
  });

export const deleteSiteRedirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brand: brandSchema, oldPath: z.string().max(300) }).parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const path = normalizeOldPath(data.oldPath);
    if (!path) throw new Error("Endereço inválido.");
    const { siteDb } = await import("./service.server");
    const { error } = await siteDb().from(`${data.brand}_site_redirects`).delete().eq("old_path", path);
    if (error) throw new Error("Não foi possível remover o redirecionamento.");
    return { ok: true };
  });
