import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  INSPECTION_KINDS,
  INSPECTION_STATUSES,
  ITEM_STATES,
  buildRoomPlan,
  pathBelongsTo,
  sniffAudio,
  sniffImageMime,
  type RoomKind,
} from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const INSPECTION_BUCKET = "inspection-media";
const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).nullable().optional();

class ConflictError extends Error {
  constructor() {
    super("CONFLITO: esta informação mudou em outra tela. Atualize para ver a versão mais recente.");
  }
}
function fail(error: { message?: string; code?: string } | null, fallback = "Não foi possível salvar.") {
  if (!error) return;
  if (error.code === "42501") throw new Error("Você não tem acesso a esta vistoria.");
  throw new Error(error.message || fallback);
}
async function roles(sb: any, userId: string): Promise<string[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => String(r.role));
}
async function requireInspectionRole(sb: any, userId: string) {
  const r = await roles(sb, userId);
  if (!r.some((x) => x === "admin" || x === "secretaria" || x === "corretor"))
    throw new Error("Vistoria inteligente disponível apenas para administração, secretaria e corretores.");
  return { all: r.includes("admin") || r.includes("secretaria") };
}
async function logEvent(sb: any, inspectionId: string, userId: string, event: string, details: Record<string, unknown> = {}) {
  await sb.from("inspection_events").insert({ inspection_id: inspectionId, event, details, actor_id: userId });
}

/* ---------------- Imóveis ---------------- */

const PROPERTY_COLS =
  "id, tipo, codigo, codigo_cordial, codigo_morar, carteira, finalidade, operacao, logradouro, numero, complemento, bairro, cidade, uf, cep, dormitorios, suites, banheiros, vagas, salas, mobiliado, area_total, area_construida, nome_condominio";

export const searchInspectionProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await requireInspectionRole(sb, context.userId);
    const q = data.q.replace(/[%,()*]/g, " ").trim();
    const { data: rows, error } = await sb
      .from("properties")
      .select(PROPERTY_COLS)
      .is("archived_at", null)
      .or(
        `codigo.ilike.%${q}%,codigo_cordial.ilike.%${q}%,codigo_morar.ilike.%${q}%,logradouro.ilike.%${q}%,bairro.ilike.%${q}%`,
      )
      .limit(15);
    fail(error);
    return (rows ?? []) as PropertyForInspection[];
  });

export type PropertyForInspection = {
  id: string;
  tipo: string | null;
  codigo: string | null;
  codigo_cordial: string | null;
  codigo_morar: string | null;
  carteira: string | null;
  finalidade: string | null;
  operacao: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  salas: number | null;
  mobiliado: string | null;
  area_total: number | null;
  area_construida: number | null;
  nome_condominio: string | null;
};

export const listInspectionResponsibles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { all } = await requireInspectionRole(sb, context.userId);
    if (!all) return { canChoose: false, options: [] as Array<{ id: string; nome: string }> };
    const { data, error } = await sb.rpc("shared_selection_responsibles");
    fail(error);
    return {
      canChoose: true,
      options: ((data ?? []) as any[]).map((r) => ({ id: String(r.id), nome: String(r.nome || "Sem nome") })),
    };
  });

/* ---------------- Lista / histórico ---------------- */

export type InspectionListRow = {
  id: string;
  numero: number;
  kind: string;
  status: string;
  agency: string;
  inspected_at: string | null;
  created_at: string;
  updated_at: string;
  responsible_name: string | null;
  current_version: number;
  property_id: string;
  property_snapshot: any;
};

export const listInspections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().max(80).optional(),
        status: z.enum(INSPECTION_STATUSES).optional(),
        kind: z.enum(INSPECTION_KINDS).optional(),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        page: z.number().int().min(0).max(500).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await requireInspectionRole(sb, context.userId);
    const size = 20;
    let query = sb
      .from("inspections")
      .select(
        "id, numero, kind, status, agency, inspected_at, created_at, updated_at, responsible_name, current_version, property_id, property_snapshot",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.page * size, data.page * size + size - 1);
    if (data.status) query = query.eq("status", data.status);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.from) query = query.gte("created_at", `${data.from}T00:00:00-03:00`);
    if (data.to) query = query.lte("created_at", `${data.to}T23:59:59-03:00`);
    if (data.q) {
      const q = data.q.toLowerCase().replace(/[%,()*]/g, " ").trim();
      if (q) query = query.ilike("property_snapshot->>search_text", `%${q}%`);
    }
    const { data: rows, error, count } = await query;
    fail(error);
    const { data: counts } = await sb.from("inspections").select("status");
    const byStatus: Record<string, number> = {};
    for (const r of (counts ?? []) as any[]) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return { rows: (rows ?? []) as InspectionListRow[], total: count ?? 0, pageSize: size, byStatus };
  });

/* ---------------- Criação ---------------- */

const meterSchema = z.object({
  status: z.enum(["nao_informado", "informado", "nao_aplicavel", "desligado"]),
  reading: text(40),
  number: text(40),
});
const metersSchema = z.object({ agua: meterSchema, luz: meterSchema, gas: meterSchema });
const participantsSchema = z.array(z.object({ nome: z.string().trim().min(1).max(120), papel: z.string().trim().max(60) })).max(10);
const keysSchema = z.array(z.object({ descricao: z.string().trim().min(1).max(120), quantidade: z.number().int().min(0).max(99) })).max(30);

const createSchema = z.object({
  id: uuid,
  propertyId: uuid,
  kind: z.enum(INSPECTION_KINDS),
  agency: z.enum(["cordial", "morar"]),
  responsibleId: uuid.nullable().optional(),
  inspectedAt: z.string().datetime({ offset: true }).nullable(),
  participants: participantsSchema,
  furnished: z.enum(["nao_informado", "nao", "semimobiliado", "mobiliado"]),
  cleaning: z.enum(["nao_informado", "limpo", "parcial", "sujo", "nao_se_aplica"]),
  keys: keysSchema,
  meters: metersSchema,
  confirmed: z.object({
    tipo: z.string().trim().max(60).nullable(),
    dormitorios: z.number().int().min(0).max(30).nullable(),
    suites: z.number().int().min(0).max(30).nullable(),
    banheiros: z.number().int().min(0).max(30).nullable(),
    vagas: z.number().int().min(0).max(50).nullable(),
    salas: z.number().int().min(0).max(30).nullable(),
  }),
  rooms: z
    .array(z.object({ name: z.string().trim().min(1).max(80), kind: z.string().max(30), items: z.array(z.object({ name: z.string().trim().min(1).max(80), category: z.string().max(20) })).max(60) }))
    .max(60)
    .optional(),
  planConfirmed: z.boolean(),
});

export const createInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { all } = await requireInspectionRole(sb, context.userId);
    // Idempotência: o id é gerado no aparelho; repetir o pedido devolve a mesma vistoria.
    const existing = await sb.from("inspections").select("id").eq("id", data.id).maybeSingle();
    if (existing.data) return { id: data.id as string, reused: true };

    const { data: prop, error: pe } = await sb.from("properties").select(PROPERTY_COLS).eq("id", data.propertyId).maybeSingle();
    fail(pe);
    if (!prop) throw new Error("Imóvel não encontrado ou sem acesso.");
    const responsibleId = all ? data.responsibleId || context.userId : context.userId;
    const { data: profile } = await sb.from("profiles").select("nome").eq("id", responsibleId).maybeSingle();

    const address = [prop.logradouro, prop.numero, prop.complemento].filter(Boolean).join(", ");
    const snapshot = {
      captured_at: new Date().toISOString(),
      cadastro: prop,
      confirmado: data.confirmed,
      endereco: [address, prop.bairro, [prop.cidade, prop.uf].filter(Boolean).join("/")].filter(Boolean).join(" · "),
      search_text: [prop.codigo, prop.codigo_cordial, prop.codigo_morar, prop.logradouro, prop.numero, prop.bairro, prop.cidade]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
    const { error } = await sb.from("inspections").insert({
      id: data.id,
      property_id: data.propertyId,
      agency: data.agency,
      kind: data.kind,
      responsible_id: responsibleId,
      responsible_name: profile?.nome ?? null,
      created_by: context.userId,
      inspected_at: data.inspectedAt,
      participants: data.participants,
      furnished: data.furnished,
      cleaning: data.cleaning,
      keys: data.keys,
      meters: data.meters,
      property_snapshot: snapshot,
      plan_confirmed: data.planConfirmed,
    });
    if (error?.code === "23505") return { id: data.id, reused: true };
    fail(error);

    const plan =
      data.rooms ??
      buildRoomPlan({ ...data.confirmed, furnished: data.furnished === "mobiliado" || data.furnished === "semimobiliado" });
    for (const [pos, r] of plan.entries()) {
      const { data: room, error: re } = await sb
        .from("inspection_rooms")
        .insert({ inspection_id: data.id, name: r.name, kind: r.kind, position: pos })
        .select("id")
        .single();
      fail(re);
      if (r.items.length) {
        const { error: ie } = await sb.from("inspection_items").insert(
          r.items.map((it, i) => ({ inspection_id: data.id, room_id: room.id, name: it.name, category: it.category, position: i })),
        );
        fail(ie);
      }
    }
    await logEvent(sb, data.id, context.userId, "criada", { kind: data.kind, rooms: plan.length });
    return { id: data.id as string, reused: false };
  });

/* ---------------- Leitura completa ---------------- */

export type InspectionFull = Awaited<ReturnType<typeof loadFull>>;
async function loadFull(sb: any, id: string) {
  const [insp, rooms, items, media, notes, docs, events] = await Promise.all([
    sb.from("inspections").select("*").eq("id", id).maybeSingle(),
    sb.from("inspection_rooms").select("*").eq("inspection_id", id).order("position"),
    sb.from("inspection_items").select("*").eq("inspection_id", id).order("position"),
    sb.from("inspection_media").select("*").eq("inspection_id", id).order("position").order("created_at"),
    sb.from("inspection_notes").select("*").eq("inspection_id", id).order("created_at"),
    sb.from("inspection_documents").select("id, version, byte_size, created_at, created_by").eq("inspection_id", id).order("version"),
    sb.from("inspection_events").select("id, event, details, created_at, actor_id").eq("inspection_id", id).order("created_at", { ascending: false }).limit(40),
  ]);
  for (const r of [insp, rooms, items, media, notes, docs, events]) fail(r.error, "Não foi possível carregar a vistoria.");
  if (!insp.data) throw new Error("Vistoria não encontrada ou sem acesso.");
  return {
    inspection: insp.data as any,
    rooms: (rooms.data ?? []) as any[],
    items: (items.data ?? []) as any[],
    media: (media.data ?? []) as any[],
    notes: (notes.data ?? []) as any[],
    documents: (docs.data ?? []) as any[],
    events: (events.data ?? []) as any[],
    serverTime: new Date().toISOString(),
  };
}

export const getInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireInspectionRole(context.supabase, context.userId);
    return loadFull(context.supabase as any, data.id);
  });

/* ---------------- Atualizações com controle de revisão ---------------- */

async function casUpdate(sb: any, table: string, id: string, expectedRevision: number, patch: Record<string, unknown>) {
  const { data, error } = await sb.from(table).update(patch).eq("id", id).eq("revision", expectedRevision).select("*");
  fail(error);
  if (!data?.length) throw new ConflictError();
  return data[0];
}

export const updateInspectionBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        expectedRevision: z.number().int(),
        patch: z
          .object({
            kind: z.enum(INSPECTION_KINDS),
            status: z.enum(["rascunho", "em_andamento", "em_revisao"]),
            inspected_at: z.string().datetime({ offset: true }).nullable(),
            participants: participantsSchema,
            furnished: createSchema.shape.furnished,
            cleaning: createSchema.shape.cleaning,
            keys: keysSchema,
            meters: metersSchema,
            plan_confirmed: z.boolean(),
            general_notes: text(4000),
            conclusion: text(4000),
            responsible_id: uuid,
          })
          .partial()
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { all } = await requireInspectionRole(sb, context.userId);
    const patch: Record<string, unknown> = { ...data.patch };
    if (patch.responsible_id) {
      if (!all) throw new Error("Somente administração ou secretaria trocam o responsável.");
      const { data: p } = await sb.from("profiles").select("nome").eq("id", patch.responsible_id).maybeSingle();
      patch.responsible_name = p?.nome ?? null;
    }
    const row = await casUpdate(sb, "inspections", data.id, data.expectedRevision, patch);
    if (data.patch.status) await logEvent(sb, data.id, context.userId, "status", { status: data.patch.status });
    return row;
  });

export const addRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inspectionId: uuid, name: z.string().trim().min(1).max(80), kind: z.string().max(30), furnished: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { count } = await sb.from("inspection_rooms").select("id", { count: "exact", head: true }).eq("inspection_id", data.inspectionId);
    const { data: room, error } = await sb
      .from("inspection_rooms")
      .insert({ inspection_id: data.inspectionId, name: data.name, kind: data.kind, position: count ?? 0 })
      .select("*")
      .single();
    fail(error);
    const { itemsForRoom } = await import("./model");
    const items = itemsForRoom(data.kind as RoomKind, data.furnished);
    if (items.length) {
      const { error: ie } = await sb
        .from("inspection_items")
        .insert(items.map((it, i) => ({ inspection_id: data.inspectionId, room_id: room.id, name: it.name, category: it.category, position: i })));
      fail(ie);
    }
    await logEvent(sb, data.inspectionId, context.userId, "ambiente_adicionado", { room_id: room.id, name: data.name });
    return room;
  });

export const updateRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        expectedRevision: z.number().int(),
        patch: z.object({ name: z.string().trim().min(1).max(80), no_photo_reason: text(500) }).partial().strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => casUpdate(context.supabase, "inspection_rooms", data.id, data.expectedRevision, data.patch));

export const reorderRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid, order: z.array(uuid).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    for (const [i, id] of data.order.entries()) {
      const { error } = await sb.from("inspection_rooms").update({ position: i }).eq("id", id).eq("inspection_id", data.inspectionId);
      fail(error);
    }
    return { ok: true };
  });

export const deleteRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, inspectionId: uuid, confirmed: z.literal(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: media } = await sb.from("inspection_media").select("storage_path").eq("room_id", data.id).eq("inspection_id", data.inspectionId);
    const { data: notes } = await sb.from("inspection_notes").select("audio_path").eq("room_id", data.id).eq("inspection_id", data.inspectionId);
    const { error } = await sb.from("inspection_rooms").delete().eq("id", data.id).eq("inspection_id", data.inspectionId);
    fail(error);
    const paths = [...(media ?? []).map((m: any) => m.storage_path), ...(notes ?? []).map((n: any) => n.audio_path)].filter(Boolean);
    if (paths.length) await sb.storage.from(INSPECTION_BUCKET).remove(paths);
    await logEvent(sb, data.inspectionId, context.userId, "ambiente_removido", { room_id: data.id, arquivos: paths.length });
    return { ok: true };
  });

export const addItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid, roomId: uuid, name: z.string().trim().min(1).max(80), category: z.string().max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { count } = await sb.from("inspection_items").select("id", { count: "exact", head: true }).eq("room_id", data.roomId);
    const { data: row, error } = await sb
      .from("inspection_items")
      .insert({ inspection_id: data.inspectionId, room_id: data.roomId, name: data.name, category: data.category, position: count ?? 0 })
      .select("*")
      .single();
    fail(error);
    return row;
  });

export const updateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        expectedRevision: z.number().int(),
        patch: z
          .object({
            name: z.string().trim().min(1).max(80),
            state: z.enum(ITEM_STATES),
            quantity: z.number().min(0).max(9999).nullable(),
            material: text(120),
            color: text(80),
            notes: text(4000),
            damage: text(4000),
            untested_reason: text(500),
          })
          .partial()
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => casUpdate(context.supabase, "inspection_items", data.id, data.expectedRevision, data.patch));

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("inspection_items").delete().eq("id", data.id);
    fail(error);
    return { ok: true };
  });

/* ---------------- Fotos ---------------- */

async function readObjectHead(sb: any, path: string, bytes = 16) {
  const { data, error } = await sb.storage.from(INSPECTION_BUCKET).download(path);
  if (error || !data) throw new Error("Arquivo não encontrado no armazenamento. Envie novamente.");
  const buf = new Uint8Array(await (data as Blob).arrayBuffer());
  return { head: buf.slice(0, bytes), size: buf.byteLength };
}

export const registerMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        roomId: uuid,
        itemId: uuid.nullable(),
        clientKey: z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/),
        storagePath: z.string().max(300),
        width: z.number().int().positive().max(20000).nullable(),
        height: z.number().int().positive().max(20000).nullable(),
        takenAt: z.string().datetime({ offset: true }),
        timeSource: z.enum(["captura", "importacao"]),
        caption: text(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    if (!pathBelongsTo(data.storagePath, data.inspectionId, data.roomId))
      throw new Error("A foto não pertence a este ambiente.");
    const existing = await sb.from("inspection_media").select("*").eq("inspection_id", data.inspectionId).eq("client_key", data.clientKey).maybeSingle();
    if (existing.data) {
      if (existing.data.room_id !== data.roomId) throw new Error("Foto já registrada em outro ambiente.");
      return existing.data;
    }
    const { head, size } = await readObjectHead(sb, data.storagePath);
    const mime = sniffImageMime(head);
    if (!mime) {
      await sb.storage.from(INSPECTION_BUCKET).remove([data.storagePath]);
      throw new Error("Arquivo enviado não é uma imagem válida.");
    }
    if (size > 25 * 1024 * 1024) throw new Error("Foto acima de 25 MB.");
    const { count } = await sb.from("inspection_media").select("id", { count: "exact", head: true }).eq("room_id", data.roomId);
    const { data: row, error } = await sb
      .from("inspection_media")
      .insert({
        inspection_id: data.inspectionId,
        room_id: data.roomId,
        item_id: data.itemId,
        client_key: data.clientKey,
        storage_path: data.storagePath,
        mime,
        size_bytes: size,
        width: data.width,
        height: data.height,
        caption: data.caption ?? null,
        position: count ?? 0,
        taken_at: data.takenAt,
        time_source: data.timeSource,
        status: "confirmada",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const again = await sb.from("inspection_media").select("*").eq("inspection_id", data.inspectionId).eq("client_key", data.clientKey).maybeSingle();
      if (again.data) return again.data;
    }
    fail(error);
    return row;
  });

export const updateMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        expectedRevision: z.number().int(),
        patch: z.object({ caption: text(300), position: z.number().int().min(0).max(999), item_id: uuid.nullable() }).partial().strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => casUpdate(context.supabase, "inspection_media", data.id, data.expectedRevision, data.patch));

export const deleteMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, confirmed: z.literal(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row } = await sb.from("inspection_media").select("storage_path, inspection_id").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    const { error } = await sb.from("inspection_media").delete().eq("id", data.id);
    fail(error);
    await sb.storage.from(INSPECTION_BUCKET).remove([row.storage_path]);
    await logEvent(sb, row.inspection_id, context.userId, "foto_excluida", { media_id: data.id });
    return { ok: true };
  });

export const signInspectionFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid, paths: z.array(z.string().max(300)).max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    const paths = data.paths.filter((p) => p.startsWith(`${data.inspectionId}/`));
    if (!paths.length) return {} as Record<string, string>;
    const { data: signed, error } = await (context.supabase as any).storage.from(INSPECTION_BUCKET).createSignedUrls(paths, 3600);
    fail(error);
    const out: Record<string, string> = {};
    for (const s of (signed ?? []) as any[]) if (s.path && s.signedUrl) out[s.path] = s.signedUrl;
    return out;
  });

/* ---------------- Relatos (voz/texto) ---------------- */

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        roomId: uuid,
        itemId: uuid.nullable(),
        clientKey: z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/),
        source: z.enum(["voz", "texto"]),
        audioPath: z.string().max(300).nullable(),
        audioMime: z.string().max(60).nullable(),
        audioSeconds: z.number().min(0).max(3600).nullable(),
        text: text(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const existing = await sb.from("inspection_notes").select("*").eq("inspection_id", data.inspectionId).eq("client_key", data.clientKey).maybeSingle();
    if (existing.data) return existing.data;
    if (data.audioPath) {
      if (!pathBelongsTo(data.audioPath, data.inspectionId, data.roomId)) throw new Error("O áudio não pertence a este ambiente.");
      const { head } = await readObjectHead(sb, data.audioPath);
      if (!sniffAudio(head)) throw new Error("Arquivo de áudio inválido.");
    }
    const isText = data.source === "texto";
    const { data: row, error } = await sb
      .from("inspection_notes")
      .insert({
        inspection_id: data.inspectionId,
        room_id: data.roomId,
        item_id: data.itemId,
        client_key: data.clientKey,
        source: data.source,
        audio_path: data.audioPath,
        audio_mime: data.audioMime,
        audio_seconds: data.audioSeconds,
        transcript_original: isText ? data.text ?? null : null,
        status: isText ? "transcrito" : "pendente_transcricao",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const again = await sb.from("inspection_notes").select("*").eq("inspection_id", data.inspectionId).eq("client_key", data.clientKey).maybeSingle();
      if (again.data) return again.data;
    }
    fail(error);
    return row;
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        expectedRevision: z.number().int(),
        patch: z
          .object({
            approved_text: text(8000),
            status: z.enum(["transcrito", "revisado", "descartado"]),
            item_id: uuid.nullable(),
          })
          .partial()
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => casUpdate(context.supabase, "inspection_notes", data.id, data.expectedRevision, data.patch));

/* ---------------- Conclusão e documentos ---------------- */

export const finalizeInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        expectedRevision: z.number().int(),
        storagePath: z.string().max(300),
        byteSize: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        snapshot: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("inspection_finalize", {
      p_id: data.id,
      p_expected_revision: data.expectedRevision,
      p_storage_path: data.storagePath,
      p_byte_size: data.byteSize,
      p_sha256: data.sha256,
      p_snapshot: data.snapshot,
    });
    if (error?.code === "40001") throw new ConflictError();
    fail(error);
    return res as { version: number };
  });

export const reopenInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, expectedRevision: z.number().int(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("inspection_reopen", {
      p_id: data.id,
      p_expected_revision: data.expectedRevision,
      p_reason: data.reason,
    });
    if (error?.code === "40001") throw new ConflictError();
    fail(error);
    return { ok: true };
  });

export const signInspectionDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid, version: z.number().int().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: doc, error } = await sb
      .from("inspection_documents")
      .select("storage_path")
      .eq("inspection_id", data.inspectionId)
      .eq("version", data.version)
      .maybeSingle();
    fail(error);
    if (!doc) throw new Error("Versão do laudo não encontrada.");
    const { data: s, error: se } = await sb.storage.from(INSPECTION_BUCKET).createSignedUrl(doc.storage_path, 600);
    fail(se);
    return { url: s.signedUrl as string };
  });
