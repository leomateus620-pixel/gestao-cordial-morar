import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingsSchema } from "./contract";

async function requireAdmin(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Acesso restrito à administração.");
}
export const adminSiteSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(10000).default(0),
        reference: z.string().trim().max(80).default(""),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    let properties = db
      .from("properties")
      .select(
        "id,codigo_cordial,tipo,cidade,bairro,carteira,operacao,autorizacao,exibir_imovel,is_draft,disponibilidade,archived_at,removal_state",
        { count: "exact" },
      )
      .order("id")
      .range(data.page * 24, data.page * 24 + 23);
    if (data.reference) properties = properties.eq("codigo_cordial", data.reference);
    const [settings, pages, leads, audit, list] = await Promise.all([
      db.from("cordial_site_settings").select("content").eq("id", true).single(),
      db
        .from("cordial_site_pages")
        .select("slug,kind,title,summary,body,published")
        .order("slug")
        .limit(100),
      db
        .from("cordial_site_leads")
        .select(
          "id,name,phone,email,message,kind,public_reference,operation,property_type,city,status,attendance_id,created_at,entry_path",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("cordial_site_audit")
        .select("id,entity,entity_id,action,actor,created_at")
        .order("id", { ascending: false })
        .limit(40),
      properties,
    ]);
    if ([settings, pages, leads, audit, list].some((x) => x.error))
      throw new Error(
        "O módulo do site ainda não está disponível. Verifique a migração em homologação.",
      );
    const ids = (list.data ?? []).map((p) => p.id);
    const publications = ids.length
      ? await db
          .from("cordial_site_publications")
          .select(
            "property_id,public_id,public_reference,state,cordial_authorized,availability_confirmed,published_at,updated_at",
          )
          .in("property_id", ids)
      : { data: [], error: null };
    if (publications.error) throw new Error("Não foi possível consultar as publicações.");
    return {
      settings: settingsSchema.parse(settings.data?.content ?? {}),
      pages: pages.data ?? [],
      leads: leads.data ?? [],
      audit: audit.data ?? [],
      properties: (list.data ?? []).map((p) => ({
        ...p,
        publication: publications.data?.find((s) => s.property_id === p.id) ?? null,
      })),
      total: list.count ?? 0,
    };
  });
export const reviewSiteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        publish: z.boolean(),
        authorize: z.boolean(),
        available: z.boolean(),
        content: z.boolean(),
        media: z.boolean(),
        areas: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    const result = await db.rpc("cordial_site_review", {
      _property_id: data.propertyId,
      _publish: data.publish,
      _authorize: data.authorize,
      _available: data.available,
      _review_content: data.content,
      _review_media: data.media,
      _areas_m2: data.areas,
    });
    if (result.error)
      throw new Error(
        "Publicação bloqueada. Confira autorização, disponibilidade, revisão e estado do imóvel.",
      );
    return { id: result.data as string };
  });
const editorialSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
  kind: z.enum(["page", "news", "district"]),
  title: z.string().min(1).max(200),
  summary: z.string().max(600),
  body: z.string().max(50000),
  published: z.boolean(),
});
export const saveSiteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("settings"), content: settingsSchema }),
        z.object({ kind: z.literal("page"), content: editorialSchema }),
      ])
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    const result = await db.rpc("cordial_site_save_content", {
      _kind: data.kind,
      _key: data.kind === "page" ? data.content.slug : "settings",
      _content: data.content,
    });
    if (result.error) throw new Error("Não foi possível salvar o conteúdo.");
    return { ok: true };
  });
export const triageSiteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        operation: z.enum(["compra", "aluguel", "ambos"]),
        type: z.enum([
          "casa",
          "apartamento",
          "terreno",
          "sala_comercial",
          "area_rural",
          "sitio_chacara",
          "outro",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const result = await db.rpc("cordial_site_triage", {
      _lead_id: data.id,
      _operation: data.operation,
      _type: data.type,
    });
    if (result.error) throw new Error("Não foi possível encaminhar para atendimento.");
    return { id: result.data as string };
  });
