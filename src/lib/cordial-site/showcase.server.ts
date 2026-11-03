/**
 * Vitrine semanal (somente servidor). Isolada do Realce: não lê nem grava testes do Realce,
 * não altera fotos/galerias dos imóveis e grava apenas no bucket privado `cordial-showcase`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SCHEDULE,
  SHOWCASE_MODEL,
  SHOWCASE_PROMPT,
  SHOWCASE_PROMPT_VERSION,
  SHOWCASE_REPEAT_WEEKS,
  SHOWCASE_SIZE,
  addWeeks,
  canRegenerate,
  chooseCandidate,
  planWorker,
  type Candidate,
  type ShowcaseSchedule,
  type ShowcaseState,
  type WeekRow,
} from "./showcase";

const BUCKET = "cordial-showcase";
const GATEWAY = "https://ai.gateway.lovable.dev";
// Tabelas novas ainda não usadas em tipos gerados por todo o projeto: cliente sem tipos estritos.
type Db = SupabaseClient;

export type EditOutcome =
  | { kind: "ok"; bytes: Uint8Array }
  | { kind: "fail"; message: string; pause?: boolean }
  | { kind: "retry"; message: string }
  | { kind: "uncertain"; message: string };

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function safeMessage(text: string, fallback: string) {
  try {
    const j = JSON.parse(text);
    const m = j?.error?.message ?? j?.message;
    if (typeof m === "string" && m) return m.slice(0, 240);
  } catch { /* não-JSON */ }
  return fallback;
}

export async function editPhoto(bytes: Uint8Array, mime: string): Promise<EditOutcome> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { kind: "fail", message: "IA não configurada.", pause: true };
  const form = new FormData();
  form.set("model", SHOWCASE_MODEL);
  form.set("prompt", SHOWCASE_PROMPT);
  form.set("size", SHOWCASE_SIZE.size);
  form.set("quality", "high");
  form.set("output_format", "jpeg");
  form.set("stream", "true");
  form.set("image", new File([bytes as BlobPart], "foto.jpg", { type: mime }));
  let res: Response;
  try {
    res = await fetch(`${GATEWAY}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: form,
    });
  } catch {
    return { kind: "uncertain", message: "A conexão com a IA caiu durante o envio." };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429 || res.status >= 500) return { kind: "retry", message: "Serviço de IA ocupado no momento." };
    if (res.status === 402) return { kind: "fail", message: safeMessage(text, "Créditos de IA insuficientes."), pause: true };
    if (res.status === 403) return { kind: "fail", message: safeMessage(text, "Acesso à IA bloqueado."), pause: true };
    return { kind: "fail", message: safeMessage(text, "A IA recusou esta foto.") };
  }
  if (!res.body) return { kind: "uncertain", message: "Resposta vazia da IA." };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: string | null = null;
  let errorMsg: string | null = null;
  let events = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          events++;
          if (ev.type === "error" || ev.error) errorMsg = String(ev.error?.message ?? ev.message ?? "Erro da IA").slice(0, 240);
          else if (typeof ev.type === "string" && ev.type.endsWith(".completed") && ev.b64_json) final = ev.b64_json;
        } catch { /* quadro incompleto */ }
      }
    }
  } catch {
    return { kind: "uncertain", message: "A resposta da IA foi interrompida." };
  }
  if (final) return { kind: "ok", bytes: b64ToBytes(final) };
  if (errorMsg) return { kind: "fail", message: errorMsg };
  return { kind: "uncertain", message: events ? "A IA não entregou a imagem final." : "A IA encerrou sem resposta." };
}

async function sha(bytes: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function readSchedule(db: Db): Promise<ShowcaseSchedule & { paused: boolean }> {
  const { data } = await db.from("cordial_site_showcase_settings").select("*").eq("id", true).maybeSingle();
  return {
    paused: data?.paused ?? false,
    prepareDow: data?.prepare_dow ?? DEFAULT_SCHEDULE.prepareDow,
    prepareHour: data?.prepare_hour ?? DEFAULT_SCHEDULE.prepareHour,
    activateHour: data?.activate_hour ?? DEFAULT_SCHEDULE.activateHour,
  };
}

/** Imóveis publicados no site Cordial com a capa autorizada (primeira foto). */
export async function loadCandidates(db: Db): Promise<Candidate[]> {
  const [{ data: eligible, error: e1 }, { data: media, error: e2 }] = await Promise.all([
    db.from("cordial_site_eligible").select("property_id,public_id,published_at").limit(3000),
    db.from("cordial_site_authorized_media").select("id,public_id,position,version,width,height").order("position").limit(20000),
  ]);
  if (e1 || e2) throw new Error("Não foi possível ler os imóveis publicados.");
  const cover = new Map<string, { id: string; version: string; width: number | null; height: number | null }>();
  for (const m of media ?? []) if (!cover.has(m.public_id)) cover.set(m.public_id, m);
  return (eligible ?? []).flatMap((e) => {
    const c = cover.get(e.public_id);
    return c ? [{ propertyId: e.property_id, publicId: e.public_id, mediaId: c.id, mediaVersion: c.version, width: c.width, height: c.height, publishedAt: e.published_at }] : [];
  });
}

async function recentPropertyIds(db: Db, week: string) {
  const { data } = await db
    .from("cordial_site_showcase_weeks")
    .select("property_id")
    .gte("week_start", addWeeks(week, -SHOWCASE_REPEAT_WEEKS))
    .in("state", ["ativo", "encerrado", "pronto", "aguardando_revisao"]);
  return (data ?? []).map((r) => r.property_id as string);
}

export async function createWeek(db: Db, week: string, opts: { activate?: boolean; pick?: Candidate; userId?: string } = {}) {
  const pick = opts.pick ?? chooseCandidate(await loadCandidates(db), await recentPropertyIds(db, week));
  if (!pick) return null;
  const { data, error } = await db
    .from("cordial_site_showcase_weeks")
    .insert({
      week_start: week,
      property_id: pick.propertyId,
      public_id: pick.publicId,
      media_id: pick.mediaId,
      media_version: pick.mediaVersion,
      source: opts.pick ? "manual" : "auto",
      state: "agendado",
      use_original: true,
      created_by: opts.userId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null; // já existe para a semana: nada a duplicar
    throw new Error("Não foi possível registrar o imóvel da semana.");
  }
  if (opts.activate) await activate(db, data.id, true);
  return data.id as string;
}

export async function activate(db: Db, weekId: string, withOriginal: boolean) {
  const now = new Date().toISOString();
  await db.from("cordial_site_showcase_weeks").update({ state: "encerrado", active_until: now, updated_at: now }).eq("state", "ativo").neq("id", weekId);
  const { data: row } = await db.from("cordial_site_showcase_weeks").select("approved_at,storage_path").eq("id", weekId).single();
  const original = withOriginal || !row?.approved_at || !row?.storage_path;
  await db.from("cordial_site_showcase_weeks").update({ state: "ativo", use_original: original, active_from: now, active_until: null, updated_at: now }).eq("id", weekId);
}

export type GenerateResult = { ok: boolean; message: string; paused?: boolean };

/** Gera a edição de uma semana. Trava pelo lease: um segundo pedido simultâneo é recusado. */
export async function generate(db: Db, weekId: string, requestedBy?: string): Promise<GenerateResult> {
  const { data: row } = await db.from("cordial_site_showcase_weeks").select("*").eq("id", weekId).maybeSingle();
  if (!row) return { ok: false, message: "Semana não encontrada." };
  const state = row.state as ShowcaseState;
  if (state !== "agendado" && !canRegenerate(state)) return { ok: false, message: "Já existe uma edição em andamento." };
  if (row.lease_until && new Date(row.lease_until) > new Date()) return { ok: false, message: "Já existe uma edição em andamento." };
  const lease = crypto.randomUUID();
  const attemptNo = (row.attempts ?? 0) + 1;
  const isLive = state === "ativo";
  let claim = db
    .from("cordial_site_showcase_weeks")
    .update({
      state: isLive ? "ativo" : "gerando",
      lease,
      lease_until: new Date(Date.now() + 5 * 60_000).toISOString(),
      attempts: attemptNo,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", weekId)
    .eq("attempts", row.attempts ?? 0);
  claim = claim.eq("state", state);
  const { data: claimed } = await claim.select("id");
  if (!claimed?.length) return { ok: false, message: "Já existe uma edição em andamento." };
  const { error: attErr } = await db.from("cordial_site_showcase_attempts").insert({ week_id: weekId, attempt_no: attemptNo, requested_by: requestedBy ?? null });
  if (attErr) return { ok: false, message: "Pedido duplicado bloqueado." };

  const finish = async (patch: Record<string, unknown>, outcome: string, message: string | null) => {
    await db.from("cordial_site_showcase_weeks").update({ ...patch, lease: null, lease_until: null, updated_at: new Date().toISOString() }).eq("id", weekId).eq("lease", lease);
    await db.from("cordial_site_showcase_attempts").update({ outcome, message, finished_at: new Date().toISOString() }).eq("week_id", weekId).eq("attempt_no", attemptNo);
  };
  const failState = isLive ? {} : { state: "falhou" };

  const { data: media } = await db
    .from("cordial_site_authorized_media")
    .select("storage_path")
    .eq("id", row.media_id)
    .eq("version", row.media_version)
    .maybeSingle();
  if (!media) {
    await finish({ ...failState, error: "A foto escolhida não está mais publicada." }, "falhou", "foto indisponível");
    return { ok: false, message: "A foto escolhida não está mais publicada." };
  }
  const { data: blob, error: dlErr } = await db.storage.from("property-images").download(media.storage_path);
  if (dlErr || !blob || blob.size > 25 * 1024 * 1024) {
    await finish({ ...failState, error: "Não foi possível ler a foto original." }, "falhou", "original ilegível");
    return { ok: false, message: "Não foi possível ler a foto original." };
  }
  const src = new Uint8Array(await blob.arrayBuffer());
  const mime = src[0] === 0x89 && src[1] === 0x50 ? "image/png" : "image/jpeg";
  const out = await editPhoto(src, mime);
  if (out.kind === "ok") {
    const checksum = await sha(out.bytes);
    const path = `${weekId}/${checksum}.jpg`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, new Blob([out.bytes as BlobPart], { type: "image/jpeg" }), { upsert: true, contentType: "image/jpeg" });
    if (upErr) {
      await finish({ ...failState, error: "A edição ficou pronta, mas não foi salva." }, "falhou", "upload");
      return { ok: false, message: "A edição ficou pronta, mas não foi salva." };
    }
    await finish(
      {
        state: isLive ? "ativo" : "aguardando_revisao",
        use_original: true,
        approved_at: null,
        approved_by: null,
        storage_path: path,
        checksum,
        width: SHOWCASE_SIZE.width,
        height: SHOWCASE_SIZE.height,
        model: SHOWCASE_MODEL,
        prompt_version: SHOWCASE_PROMPT_VERSION,
      },
      "ok",
      null,
    );
    return { ok: true, message: "Edição pronta para revisão." };
  }
  if (out.kind === "uncertain") {
    await finish(isLive ? { error: out.message } : { state: "incerto", error: out.message }, "incerto", out.message);
    return { ok: false, message: out.message };
  }
  if (out.kind === "fail" && out.pause) {
    await db.from("cordial_site_showcase_settings").update({ paused: true, last_run_summary: `Pausada: ${out.message}` }).eq("id", true);
  }
  await finish({ ...failState, error: out.message }, out.kind === "fail" && out.pause ? "pausado" : "falhou", out.message);
  return { ok: false, message: out.message, paused: out.kind === "fail" && out.pause };
}

/** Rotina horária: ativa a semana, prepara a próxima, troca imóvel retirado. Uma geração por execução. */
export async function runShowcase(db: Db, now = new Date()) {
  const lock = crypto.randomUUID();
  const { data: got } = await db.rpc("cordial_site_showcase_take_lock", { _lease: lock, _seconds: 360 });
  if (got !== true) return { skipped: "em execução" };
  const log: string[] = [];
  try {
    const sched = await readSchedule(db);
    // Lease vencido durante a geração: incerto, sem reenvio automático.
    const { data: stale } = await db
      .from("cordial_site_showcase_weeks")
      .select("id,state")
      .lt("lease_until", now.toISOString());
    for (const s of stale ?? []) {
      await db.from("cordial_site_showcase_weeks").update(s.state === "gerando" ? { state: "incerto", lease: null, lease_until: null, error: "A geração foi interrompida." } : { lease: null, lease_until: null }).eq("id", s.id);
      await db.from("cordial_site_showcase_attempts").update({ outcome: "incerto", message: "interrompida", finished_at: now.toISOString() }).eq("week_id", s.id).is("finished_at", null);
      log.push("geração interrompida marcada como incerta");
    }
    // Imóvel ativo saiu do site ou a foto foi revogada: troca para o próximo válido.
    const { data: activeRows } = await db.from("cordial_site_showcase_weeks").select("id,week_start").eq("state", "ativo");
    if (activeRows?.length) {
      const { data: valid } = await db.rpc("cordial_site_showcase_active");
      if (!valid?.length) {
        for (const r of activeRows) await db.from("cordial_site_showcase_weeks").update({ state: "substituido", active_until: now.toISOString(), error: "Imóvel ou foto saiu do site." }).eq("id", r.id);
        log.push("imóvel da semana retirado; substituído");
      }
    }
    const { data: rows } = await db
      .from("cordial_site_showcase_weeks")
      .select("id,week_start,state,approved_at,use_original")
      .gte("week_start", addWeeks(new Date().toISOString().slice(0, 10), -3))
      .order("created_at");
    const actions = planWorker(now, sched, (rows ?? []) as WeekRow[], sched.paused);
    let generated = false;
    for (const a of actions) {
      if (a.kind === "create-and-activate") {
        const id = await createWeek(db, a.week, { activate: true });
        log.push(id ? "semana ativada com foto original" : "sem imóvel elegível; abertura neutra");
      } else if (a.kind === "activate") {
        await activate(db, a.weekId, a.withOriginal);
        log.push(a.withOriginal ? "semana ativada com foto original" : "semana ativada com edição aprovada");
      } else if (a.kind === "create") {
        const id = await createWeek(db, a.week);
        log.push(id ? "próxima semana agendada" : "sem imóvel elegível para a próxima semana");
        if (id && !generated) {
          generated = true;
          const r = await generate(db, id);
          log.push(r.ok ? "edição gerada, aguardando aprovação" : `edição: ${r.message}`);
        }
      } else if (a.kind === "generate" && !generated) {
        generated = true;
        const r = await generate(db, a.weekId);
        log.push(r.ok ? "edição gerada, aguardando aprovação" : `edição: ${r.message}`);
      }
    }
    if (sched.paused) log.push("automação pausada");
    const summary = log.join(" · ") || "nada a fazer";
    await db.from("cordial_site_showcase_settings").update({ last_run_at: now.toISOString(), last_run_summary: summary.slice(0, 500) }).eq("id", true);
    return { ok: true, summary };
  } finally {
    await db.rpc("cordial_site_showcase_release_lock", { _lease: lock });
  }
}

/** Leitura pública da vitrine ativa (já validada pelo banco). */
export async function activeShowcase(db: Db) {
  const { data, error } = await db.rpc("cordial_site_showcase_active");
  if (error) return null;
  const r = data?.[0];
  if (!r) return null;
  return {
    weekId: r.week_id as string,
    publicId: r.public_id as string,
    edited: r.edited === true && !!r.checksum,
    checksum: (r.checksum as string | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    focalX: Number(r.focal_x ?? 0.5),
    focalY: Number(r.focal_y ?? 0.5),
  };
}
