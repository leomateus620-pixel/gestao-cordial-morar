import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingsSchema, publicResponsibleSchema } from "./contract";

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
    const { siteDb } = await import("./service.server");
    const featuredOptions = await siteDb()
      .from("cordial_site_eligible")
      .select("public_id,public_reference,tipo,cidade,bairro")
      .order("public_reference")
      .limit(1000);
    let properties = db
      .from("properties")
      .select(
        "id,codigo_cordial,tipo,cidade,bairro,carteira,operacao,autorizacao,exibir_imovel,is_draft,disponibilidade,archived_at,removal_state",
        { count: "exact" },
      )
      .order("id")
      .range(data.page * 24, data.page * 24 + 23);
    if (data.reference) properties = properties.eq("codigo_cordial", data.reference);
    const [settings, pages, leads, audit, list, profiles, responsibles] = await Promise.all([
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
      db.from("profiles").select("id,nome").order("nome").limit(250),
      db
        .from("cordial_site_responsibles")
        .select("profile_id,display_name,display_role,whatsapp,photo_url,active")
        .limit(250),
    ]);
    if ([settings, pages, leads, audit, list, profiles, responsibles].some((x) => x.error))
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
    const sourceVideos = ids.length
      ? await db
          .from("property_videos")
          .select("id,property_id,file_name,upload_status,size_bytes,mime_type")
          .in("property_id", ids)
          .limit(100)
      : { data: [], error: null };
    const videoIds = (sourceVideos.data ?? []).map((v) => v.id);
    const videoAssets = videoIds.length
      ? await db
          .from("cordial_site_video_assets")
          .select("id,video_id,state,approved,error_code")
          .in("video_id", videoIds)
          .limit(100)
      : { data: [], error: null };
    const [tourCandidates, tours] = ids.length
      ? await Promise.all([
          siteDb()
            .from("cordial_site_authorized_media")
            .select("id,property_id,version,width,height,position")
            .in("property_id", ids)
            .limit(500),
          db
            .from("cordial_site_tours")
            .select("property_id,media_id,signature,approved")
            .in("property_id", ids)
            .limit(24),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    return {
      featuredOptions: featuredOptions.error ? [] : (featuredOptions.data ?? []),
      settings: settingsSchema.parse(settings.data?.content ?? {}),
      pages: pages.data ?? [],
      leads: leads.data ?? [],
      audit: audit.data ?? [],
      profiles: profiles.data ?? [],
      responsibles: responsibles.data ?? [],
      properties: (list.data ?? []).map((p) => ({
        ...p,
        publication: publications.data?.find((s) => s.property_id === p.id) ?? null,
        tour: tours.data?.find((t) => t.property_id === p.id) ?? null,
        tourCandidates: (tourCandidates.data ?? []).filter(
          (m) => m.property_id === p.id && m.width > 0 && m.height > 0 && m.width === m.height * 2,
        ),
        videos: (sourceVideos.data ?? [])
          .filter((v) => v.property_id === p.id)
          .map((v) => ({
            ...v,
            asset: videoAssets.data?.find((a) => a.video_id === v.id) ?? null,
          })),
      })),
      total: list.count ?? 0,
    };
  });
export const saveSiteTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mediaId: z.string().uuid(),
        signature: z.string().regex(/^[a-f0-9]{32}$/),
        approve: z.boolean(),
        declared: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    let width = 1,
      height = 1;
    if (data.approve) {
      if (!data.declared) throw new Error("Declare o formato e revise o panorama.");
      const { mediaResponse } = await import("./http.server");
      const response = await mediaResponse(data.mediaId, data.signature, "full", "cordial");
      if (!response.ok) throw new Error("A mídia não está autorizada ou disponível.");
      const { decodeRaster } = await import("@/lib/imoveis/watermark-purejs.server");
      const raster = decodeRaster(new Uint8Array(await response.arrayBuffer()), "image/jpeg");
      width = raster.width;
      height = raster.height;
      if (width !== 2 * height)
        throw new Error("O panorama precisa ter proporção equiretangular 2:1 verificada.");
    }
    const result = await db.rpc("cordial_site_save_tour", {
      _media_id: data.mediaId,
      _signature: data.signature,
      _approve: data.approve,
      _declared_equirectangular: data.declared,
      _width: width,
      _height: height,
    });
    if (result.error || result.data !== true)
      throw new Error("Não foi possível revisar o tour. Confira a imagem atual e o formato 2:1.");
    return { ok: true };
  });
export const manageSiteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("prepare"), id: z.string().uuid() }),
        z.object({ action: z.literal("review"), id: z.string().uuid(), approve: z.boolean() }),
      ])
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    const result =
      data.action === "prepare"
        ? await db.rpc("cordial_site_prepare_video", { _video_id: data.id })
        : await db.rpc("cordial_site_review_video", { _id: data.id, _approve: data.approve });
    if (result.error || !result.data)
      throw new Error(
        "Vídeo não disponível para essa ação. Confira formato, tamanho, processamento e revisão.",
      );
    return { ok: true };
  });
export const saveSiteResponsible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    publicResponsibleSchema
      .omit({ kind: true })
      .extend({ profileId: z.string().uuid(), active: z.boolean() })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await requireAdmin(db, context.userId);
    const result = await db.rpc("cordial_site_save_responsible", {
      _profile_id: data.profileId,
      _name: data.name,
      _role: data.role,
      _whatsapp: data.whatsapp,
      _photo: data.photoUrl ?? "",
      _active: data.active,
    });
    if (result.error) throw new Error("Confira a equipe e os dados comerciais aprovados.");
    return { ok: true };
  });
export const prepareSitePropertyMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ publicId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const { siteDb } = await import("./service.server");
    const { mediaResponse } = await import("./http.server");
    const selected = await siteDb()
      .from("cordial_site_authorized_media")
      .select("id,version")
      .eq("public_id", data.publicId)
      .order("position")
      .order("id")
      .limit(2);
    if (selected.error) throw new Error("Não foi possível preparar a mídia.");
    let prepared = 0;
    for (const item of selected.data ?? [])
      for (const size of ["thumb", "card", "full"]) {
        const result = await mediaResponse(item.id, item.version, size, "cordial");
        if (result.ok) prepared++;
        await result.body?.cancel();
      }
    return { prepared };
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
