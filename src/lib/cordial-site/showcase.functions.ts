import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { showcaseAdapter } from "@/lib/site-showcase/brand-adapter";

const brandSchema = z.enum(["cordial", "morar"]).default("cordial");

async function requireAdmin(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Acesso restrito à administração.");
}
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as SupabaseClient;

export const showcaseSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brand: brandSchema }).parse(i ?? {}))
  .handler(async ({ context, data: input }) => {
    const A = showcaseAdapter(input.brand);
    const db = context.supabase as unknown as SupabaseClient;
    // A leitura passa pelo RLS (admin/secretária); arquivos só por links assinados curtos.
    const [{ data: settings }, { data: weeks, error }] = await Promise.all([
      db.from(A.settings).select("*").eq("id", true).maybeSingle(),
      db.from(A.weeks).select("*").order("week_start", { ascending: false }).order("created_at", { ascending: false }).limit(16),
    ]);
    if (error) throw new Error("Acesso restrito à administração.");
    const ids = (weeks ?? []).map((w) => w.id);
    const { data: attempts } = ids.length
      ? await db.from(A.attempts).select("week_id,attempt_no,started_at,finished_at,outcome,message").in("week_id", ids).order("started_at", { ascending: false }).limit(40)
      : { data: [] };
    const sa = await admin();
    const top = (weeks ?? []).slice(0, 4);
    const [{ data: eligible }, media] = await Promise.all([
      sa.from(A.eligible).select("public_id,public_reference,tipo,bairro,cidade").in("public_id", (weeks ?? []).map((w) => w.public_id)),
      sa.from(A.media).select("id,version,storage_path").in("id", top.map((w) => w.media_id)),
    ]);
    const sign = async (bucket: string, path: string | null | undefined) =>
      path ? (await sa.storage.from(bucket).createSignedUrl(path, 900)).data?.signedUrl ?? null : null;
    const previews = await Promise.all(
      top.map(async (w) => ({
        id: w.id,
        original: await sign("property-images", media.data?.find((m) => m.id === w.media_id && m.version === w.media_version)?.storage_path),
        edited: await sign(A.bucket, w.storage_path),
      })),
    );
    const { data: active } = await sa.rpc(A.rpc.active);
    return {
      settings,
      weeks: (weeks ?? []).map((w) => ({
        ...w,
        property: eligible?.find((e) => e.public_id === w.public_id) ?? null,
        preview: previews.find((p) => p.id === w.id) ?? null,
      })),
      attempts: attempts ?? [],
      activeWeekId: (active?.[0]?.week_id as string | undefined) ?? null,
      now: new Date().toISOString(),
    };
  });

export const searchShowcaseCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ reference: z.string().trim().min(1).max(40), brand: brandSchema }).parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const A = showcaseAdapter(data.brand);
    const sa = await admin();
    const { data: props } = await sa.from(A.eligible).select("public_id,property_id,public_reference,tipo,bairro,published_at").ilike("public_reference", `%${data.reference}%`).limit(5);
    const pids = (props ?? []).map((p) => p.public_id);
    const { data: media } = pids.length ? await sa.from(A.media).select("id,public_id,version,width,height,position,storage_path").in("public_id", pids).order("position").limit(120) : { data: [] };
    return Promise.all(
      (props ?? []).map(async (p) => ({
        ...p,
        photos: await Promise.all(
          (media ?? []).filter((m) => m.public_id === p.public_id).slice(0, 12).map(async (m) => ({
            id: m.id,
            version: m.version,
            width: m.width,
            height: m.height,
            url: (await sa.storage.from("property-images").createSignedUrl(m.storage_path, 900)).data?.signedUrl ?? null,
          })),
        ),
      })),
    );
  });

const actionKinds = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), weekId: z.string().uuid() }),
  z.object({ action: z.literal("use_original"), weekId: z.string().uuid() }),
  z.object({ action: z.literal("reject"), weekId: z.string().uuid() }),
  z.object({ action: z.literal("regenerate"), weekId: z.string().uuid() }),
  z.object({ action: z.literal("focal"), weekId: z.string().uuid(), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({ action: z.literal("pause"), paused: z.boolean() }),
  z.object({ action: z.literal("schedule"), prepareDow: z.number().int().min(0).max(6), prepareHour: z.number().int().min(0).max(23), activateHour: z.number().int().min(0).max(23) }),
  z.object({ action: z.literal("choose"), target: z.enum(["live", "next"]), publicId: z.string().uuid(), mediaId: z.string().uuid(), mediaVersion: z.string().regex(/^[a-f0-9]{32}$/) }),
  z.object({ action: z.literal("run") }),
]);
const actionSchema = z.intersection(actionKinds, z.object({ brand: brandSchema }));

export const showcaseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => actionSchema.parse(i))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId);
    const A = showcaseAdapter(data.brand);
    const brand = data.brand;
    const sa = await admin();
    const srv = await import("./showcase.server");
    const { liveWeek, addWeeks } = await import("./showcase");
    const now = new Date().toISOString();
    const weeks = sa.from(A.weeks);
    const row = "weekId" in data ? (await sa.from(A.weeks).select("*").eq("id", data.weekId).maybeSingle()).data : null;
    if ("weekId" in data && !row) throw new Error("Semana não encontrada.");
    switch (data.action) {
      case "approve": {
        if (!row.storage_path) throw new Error("Ainda não há edição para aprovar.");
        if (!["aguardando_revisao", "pronto", "ativo"].includes(row.state)) throw new Error("Esta edição não pode ser aprovada agora.");
        const live = row.state === "ativo";
        await weeks.update({ approved_by: context.userId, approved_at: now, use_original: false, state: live ? "ativo" : "pronto", updated_at: now }).eq("id", row.id);
        // Aprovar a semana em vigor coloca a edição no ar imediatamente.
        const sched = await srv.readSchedule(sa, brand);
        if (!live && row.week_start === liveWeek(new Date(), sched)) await srv.activate(sa, row.id, false, brand);
        return { message: live || row.week_start === liveWeek(new Date(), sched) ? "Edição aprovada e no ar." : "Edição aprovada. Entra no ar na troca da semana." };
      }
      case "use_original":
        await weeks.update({ use_original: true, approved_at: row.state === "ativo" ? row.approved_at : null, state: row.state === "ativo" ? "ativo" : row.state === "agendado" ? "agendado" : "pronto", updated_at: now }).eq("id", row.id);
        return { message: "A abertura usará a foto original." };
      case "reject":
        if (row.state === "ativo") {
          await weeks.update({ use_original: true, approved_at: null, updated_at: now }).eq("id", row.id);
          return { message: "Edição recusada. A abertura segue com a foto original." };
        }
        if (row.state === "gerando") throw new Error("Aguarde a edição terminar.");
        await weeks.update({ state: "recusado", updated_at: now }).eq("id", row.id);
        return { message: "Semana recusada. A rotina escolherá outro imóvel." };
      case "regenerate": {
        const { data: s } = await sa.from(A.settings).select("paused").eq("id", true).single();
        if (s?.paused) throw new Error("A automação está pausada. Retome antes de gerar.");
        const r = await srv.generate(sa, row.id, context.userId, brand);
        if (!r.ok) throw new Error(r.message);
        return { message: r.message };
      }
      case "focal":
        await weeks.update({ focal_x: data.x, focal_y: data.y, updated_at: now }).eq("id", row.id);
        return { message: "Ponto de foco salvo." };
      case "pause":
        await sa.from(A.settings).update({ paused: data.paused, updated_by: context.userId, updated_at: now }).eq("id", true);
        return { message: data.paused ? "Automação pausada." : "Automação retomada." };
      case "schedule":
        await sa.from(A.settings).update({ prepare_dow: data.prepareDow, prepare_hour: data.prepareHour, activate_hour: data.activateHour, updated_by: context.userId, updated_at: now }).eq("id", true);
        return { message: "Horários salvos." };
      case "choose": {
        const { data: m } = await sa.from(A.media).select("id,version,width,height,public_id,property_id").eq("id", data.mediaId).eq("version", data.mediaVersion).eq("public_id", data.publicId).maybeSingle();
        const { data: e } = await sa.from(A.eligible).select("property_id,published_at").eq("public_id", data.publicId).maybeSingle();
        if (!m || !e) throw new Error("Este imóvel ou foto não está publicado no site.");
        const sched = await srv.readSchedule(sa, brand);
        const live = liveWeek(new Date(), sched);
        const week = data.target === "live" ? live : addWeeks(live, 1);
        const { data: cur } = await sa.from(A.weeks).select("id,state").eq("week_start", week).not("state", "in", "(recusado,substituido)");
        if (cur?.some((c) => c.state === "gerando")) throw new Error("Aguarde a edição em andamento terminar.");
        for (const c of cur ?? []) await weeks.update({ state: "substituido", active_until: c.state === "ativo" ? now : null, updated_at: now }).eq("id", c.id);
        const id = await srv.createWeek(sa, week, {
          activate: data.target === "live",
          userId: context.userId,
          pick: { propertyId: e.property_id, publicId: data.publicId, mediaId: m.id, mediaVersion: m.version, width: m.width, height: m.height, publishedAt: e.published_at },
        }, brand);
        if (!id) throw new Error("Este imóvel e foto já foram usados nesta semana.");
        return { message: data.target === "live" ? "Imóvel trocado na abertura (foto original)." : "Imóvel escolhido para a próxima semana." };
      }
      case "run": {
        const r = await srv.runShowcase(sa, new Date(), brand);
        return { message: "summary" in r ? `Rotina executada: ${r.summary}` : "A rotina já está em execução." };
      }
    }
  });
