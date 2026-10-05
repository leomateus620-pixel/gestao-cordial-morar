import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingsSchema } from "@/lib/cordial-site/contract";

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
      .from("morar_site_admin_catalog")
      .select(
        "id,codigo_morar,tipo,cidade,bairro,carteira,operacao,autorizacao,exibir_imovel,is_draft,disponibilidade,archived_at,removal_state",
        { count: "exact" },
      )
      .order("id")
      .range(data.page * 24, data.page * 24 + 23);
    if (data.reference) properties = properties.eq("codigo_morar", data.reference);
    const [settings, pages, leads, audit, list, heroOptions] = await Promise.all([
      db.from("morar_site_settings").select("content").eq("id", true).single(),
      db
        .from("morar_site_pages")
        .select("slug,kind,title,summary,body,published")
        .order("slug")
        .limit(100),
      db
        .from("morar_site_leads")
        .select(
          "id,name,phone,email,message,kind,public_reference,operation,property_type,city,status,attendance_id,created_at,entry_path",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("morar_site_audit")
        .select("id,entity,entity_id,action,actor,created_at")
        .order("id", { ascending: false })
        .limit(40),
      properties,
      db
        .from("morar_site_admin_public_catalog")
        .select("public_id,public_reference,tipo,cidade,bairro")
        .order("public_reference")
        .limit(1000),
    ]);
    if ([settings, pages, leads, audit, list, heroOptions].some((x) => x.error))
      throw new Error(
        "O módulo do site ainda não está disponível. Verifique a migração em homologação.",
      );
    const ids = (list.data ?? []).map((p) => p.id);
    const publications = ids.length
      ? await db
          .from("morar_site_publications")
          .select(
            "property_id,public_id,public_reference,state,morar_authorized,availability_confirmed,published_at,updated_at",
          )
          .in("property_id", ids)
      : { data: [], error: null };
    if (publications.error) throw new Error("Não foi possível consultar as publicações.");
    return {
      settings: settingsSchema.parse({
        brand: "Morar Imóveis",
        tagline: "Nós temos a chave da sua felicidade!",
        ...(settings.data?.content ?? {}),
      }),
      pages: pages.data ?? [],
      leads: leads.data ?? [],
      audit: audit.data ?? [],
      properties: (list.data ?? []).map((p) => ({
        ...p,
        publication: publications.data?.find((s) => s.property_id === p.id) ?? null,
      })),
      total: list.count ?? 0,
      heroOptions: heroOptions.data ?? [],
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
    const result = await db.rpc("morar_site_review", {
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
    let mediaPending = false;
    if (data.publish && data.media) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
        const images = await enqueueImageJobs(supabaseAdmin, data.propertyId);
        mediaPending = images.enqueued > 0;
        if (mediaPending) {
          const { kickOwnedMorarImageWorker } = await import("./image-worker.server");
          await kickOwnedMorarImageWorker();
        }
      } catch {
        mediaPending = true;
      }
    }
    return { id: result.data as string, mediaPending };
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
    const result = await db.rpc("morar_site_save_content", {
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
    const result = await db.rpc("morar_site_triage", {
      _lead_id: data.id,
      _operation: data.operation,
      _type: data.type,
    });
    if (result.error) throw new Error("Não foi possível encaminhar para atendimento.");
    return { id: result.data as string };
  });

const inventoryItemSchema = z.object({
  propertyId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  snapshotHash: z.string().min(1).max(200),
  candidate: z.boolean(),
  reference: z.string().nullable(),
  source: z.string().nullable(),
  requiresAuthorizationReview: z.boolean(),
  requiresAvailabilityReview: z.boolean(),
  blockers: z.array(z.string()),
});
export type MorarInventoryItem = z.infer<typeof inventoryItemSchema>;
const inventoryResponseSchema = z.object({
  items: z.array(inventoryItemSchema),
  nextCursor: z.string().uuid().nullable(),
  total: z.number().int().nonnegative(),
});

/** Read-only, deterministic cursor. The UI keeps the reviewed revision/hash. */
export const loadSiteInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cursor: z.string().uuid().nullable().default(null) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    const result = await db.rpc("morar_site_inventory", { _cursor: data.cursor, _limit: 100 });
    if (result.error)
      throw new Error(
        "Não foi possível levantar o inventário Morar. Nenhuma publicação foi alterada.",
      );
    return inventoryResponseSchema.parse(result.data);
  });

export const reviewSiteBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        batchId: z.string().uuid(),
        items: z
          .array(inventoryItemSchema.pick({ propertyId: true, revision: true, snapshotHash: true }))
          .min(1)
          .max(500),
        dryRun: z.boolean().default(true),
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
    if (!data.dryRun && (!data.authorize || !data.available || !data.content || !data.media)) {
      throw new Error(
        "Confirme autorização, disponibilidade, conteúdo e mídias do lote antes de publicar.",
      );
    }
    if (new Set(data.items.map((item) => item.propertyId)).size !== data.items.length)
      throw new Error("O lote contém imóveis repetidos.");
    const result = await db.rpc("morar_site_review_batch", {
      _batch_id: data.batchId,
      _items: data.items,
      _dry_run: data.dryRun,
      _confirm_authorization: data.authorize,
      _confirm_availability: data.available,
      _review_media: data.media,
      _areas_m2: data.areas,
    });
    if (result.error)
      throw new Error(
        "O lote não foi aplicado. O inventário pode ter mudado; confira e gere uma nova simulação.",
      );
    const response = z
      .object({
        dryRun: z.boolean(),
        ready: z.boolean().optional(),
        applied: z.number().int().nonnegative().optional(),
        writes: z.number().int().nonnegative().optional(),
        snapshotHash: z.string().min(1).max(200),
        replayed: z.boolean().optional(),
        items: z.array(
          z.object({
            propertyId: z.string().uuid(),
            ready: z.boolean().optional(),
            blockers: z.array(z.string()).optional(),
            publicId: z.string().uuid().optional(),
          }),
        ),
      })
      .parse(result.data);
    if (data.dryRun && (response.dryRun !== true || response.writes !== 0))
      throw new Error("Não foi possível confirmar a simulação sem gravação.");
    return response;
  });
