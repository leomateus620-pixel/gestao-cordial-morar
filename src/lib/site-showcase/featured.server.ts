import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { addWeeks, liveWeek, prepareAt } from "@/lib/cordial-site/showcase";
import { catalog, gallery, summaries } from "@/lib/cordial-site/service.server";
import { decodeRaster, encodeJpeg, resizeRaster } from "@/lib/imoveis/watermark-purejs.server";
import {
  applyTone,
  featuredAdapter,
  featuredPolicySchema,
  FEATURED_SCHEDULE,
  FEATURED_TREATMENT_VERSION,
  rotateFeatured,
  tonePlanSchema,
  type TonePlan,
} from "./featured";

const MODEL = "openai/gpt-6-astra";
class UncertainAnalysis extends Error {}
const hash = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
const failure = (error: unknown, message: string) => {
  if (error) throw new Error(message);
};

/** AI selects bounded editing parameters; it never generates replacement pixels or objects. */
export async function analyzeFeaturedPhoto(url: string): Promise<TonePlan> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("IA não configurada.");
  const properties = {
    exposure: { type: "number", minimum: -0.25, maximum: 0.55 },
    contrast: { type: "number", minimum: 0.94, maximum: 1.12 },
    saturation: { type: "number", minimum: 0.94, maximum: 1.12 },
    warmth: { type: "number", minimum: -0.04, maximum: 0.04 },
    shadows: { type: "number", minimum: 0, maximum: 0.08 },
    sharpness: { type: "number", minimum: 0, maximum: 0.35 },
    reason: { type: "string", minLength: 1, maxLength: 240 },
  };
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Analise esta foto real de um imóvel e escolha um tratamento fotográfico sutil, profissional e fiel. Preserve as cores reais dos materiais, as condições de conservação, todos os objetos e marcas d'água. Não propõe reconstrução, mudança de céu, conteúdo, enquadramento, perspectiva ou remoção de imperfeições. Você fornece somente parâmetros para um filtro determinístico: exposure (EV de meios-tons), contrast (1 neutro), saturation (1 neutro), warmth (0 neutro), shadows (0 neutro), sharpness (0 a .35). Fotos já boas recebem ajustes mínimos. Abra sombras e corrija dominantes apenas quando necessário, evite HDR artificial, altas luzes estouradas e halos. Motivo curto em português com até 240 caracteres.",
              },
              { type: "input_image", image_url: url, detail: "low" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "faithful_photo_treatment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties,
              required: Object.keys(properties),
            },
          },
        },
      }),
    });
  } catch {
    throw new UncertainAnalysis(
      "A análise de IA foi interrompida; não será reenviada automaticamente.",
    );
  }
  if (!response.ok)
    throw new Error(
      response.status === 402
        ? "Créditos de IA insuficientes."
        : "A análise de IA não está disponível.",
    );
  if (!response.body) throw new UncertainAnalysis("A IA respondeu sem corpo.");
  let buffer = "",
    output = "",
    completed = false;
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "response.output_text.delta") output += event.delta ?? "";
        if (event.type === "response.completed") completed = true;
        if (event.type === "error" || event.type === "response.failed")
          throw new Error("A IA não concluiu a análise.");
      }
    }
  } catch {
    throw new UncertainAnalysis("A resposta da IA foi interrompida; revisão manual necessária.");
  }
  if (!completed) throw new UncertainAnalysis("A IA não confirmou a conclusão da análise.");
  return tonePlanSchema.parse(JSON.parse(output));
}

/** All responsive sizes are produced off the visitor path, preserving geometry and originals. */
export async function renderFeaturedVariants(source: Uint8Array, plan: TonePlan) {
  let raster = decodeRaster(source, source[0] === 0x89 ? "image/png" : "image/jpeg");
  if (raster.width * raster.height > 12_000_000)
    throw new Error("Foto acima do limite de processamento.");
  if (raster.width > 1920)
    raster = resizeRaster(raster, 1920, Math.round((raster.height * 1920) / raster.width));
  const treated = applyTone(raster, plan);
  return Promise.all(
    (
      [
        ["thumb", 480, 82],
        ["card", 960, 84],
        ["full", 1920, 88],
      ] as const
    ).map(async ([size, target, quality]) => {
      const width = Math.min(target, treated.width),
        height = Math.round((treated.height * width) / treated.width);
      const frame = width === treated.width ? treated : resizeRaster(treated, width, height);
      const bytes = encodeJpeg(frame, quality);
      return { size, width, height, bytes, checksum: await hash(bytes) };
    }),
  );
}

export async function planFeaturedWeek(
  db: SupabaseClient,
  week: string,
  brand: SiteBrand,
  currentIds?: string[],
) {
  const A = featuredAdapter(brand);
  let properties;
  if (currentIds) properties = (await summaries(currentIds, brand)).items;
  else {
    const { data: recentWeeks, error } = await db
      .from(A.weeks)
      .select("id")
      .gte("week_start", addWeeks(week, -4));
    failure(error, "Não foi possível conferir a rotação dos destaques.");
    const recentIds = (recentWeeks ?? []).map((w) => w.id);
    const history = recentIds.length
      ? await db.from(A.items).select("public_id").in("week_id", recentIds)
      : { data: [], error: null };
    failure(history.error, "Não foi possível conferir o histórico dos destaques.");
    const pages = await Promise.all(
      [1, 2, 3, 4].map((pagina) => catalog({ pagina, ordem: "recentes" }, brand)),
    );
    properties = rotateFeatured(
      pages.flatMap((p) => p.items),
      (history.data ?? []).map((i) => i.public_id),
    );
  }
  const items = await Promise.all(
    properties.slice(0, 5).map(async (p, index) => {
      const photos = await gallery(p.id, brand);
      const ordered = p.cover ? [p.cover, ...photos.filter((m) => m.id !== p.cover!.id)] : photos;
      return {
        slot: index + 1,
        publicId: p.id,
        photos: ordered
          .slice(0, 3)
          .map((m, ordinal) => ({ id: m.id, version: m.version, position: m.position, ordinal })),
      };
    }),
  );
  const selected = items.filter((i) => i.photos.length);
  if (!selected.length) return null;
  const { data, error } = await db.rpc(A.plan, { _week: week, _items: selected });
  failure(error, "Não foi possível agendar os cinco destaques.");
  return data as string;
}

export async function processFeaturedPhoto(db: SupabaseClient, weekId: string, brand: SiteBrand) {
  const A = featuredAdapter(brand),
    lease = crypto.randomUUID();
  const claim = await db.rpc(A.claim, { _week: weekId, _lease: lease });
  failure(claim.error, "Não foi possível reservar a próxima foto.");
  const photo = claim.data?.[0];
  if (!photo) return { processed: false };
  const finish = async (state: string, patch: Record<string, unknown> = {}) => {
    const result = await db
      .from(A.photos)
      .update({ ...patch, state, lease: null, lease_until: null })
      .eq("id", photo.id)
      .eq("lease", lease)
      .select("id");
    failure(result.error, "Não foi possível registrar o tratamento da foto.");
    if (result.data?.length)
      await db.from(A.events).insert({
        week_id: weekId,
        photo_id: photo.id,
        kind: state,
        detail: patch.error ? { message: patch.error } : {},
      });
  };
  try {
    const authorized = () =>
      db
        .from(A.media)
        .select("storage_path")
        .eq("id", photo.media_id)
        .eq("version", photo.media_version)
        .eq("position", photo.source_position)
        .maybeSingle();
    const source = await authorized();
    failure(source.error, "Não foi possível validar a foto publicada.");
    if (!source.data) {
      await finish("invalid", { error: "O imóvel ou a foto saiu do site." });
      return { processed: true, state: "invalid" };
    }
    let plan = photo.parameters ? tonePlanSchema.parse(photo.parameters) : null;
    if (!plan) {
      const signed = await db.storage
        .from("property-images")
        .createSignedUrl(source.data.storage_path, 300);
      if (signed.error || !signed.data)
        throw new Error("Não foi possível ler a foto para análise.");
      plan = await analyzeFeaturedPhoto(signed.data.signedUrl);
      const saved = await db
        .from(A.photos)
        .update({ parameters: plan, model: MODEL, treatment_version: FEATURED_TREATMENT_VERSION })
        .eq("id", photo.id)
        .eq("lease", lease)
        .select("id");
      failure(saved.error, "Não foi possível salvar a análise de IA.");
      if (!saved.data?.length) throw new Error("A reserva de processamento expirou.");
    }
    const download = await db.storage.from("property-images").download(source.data.storage_path);
    if (download.error || !download.data || download.data.size > 25 * 1024 * 1024)
      throw new Error("Não foi possível ler a foto original.");
    const variants = await renderFeaturedVariants(
      new Uint8Array(await download.data.arrayBuffer()),
      plan,
    );
    const full = variants.find((v) => v.size === "full")!;
    const prefix = `featured/${weekId}/${photo.id}/${full.checksum}`;
    for (const v of variants) {
      const upload = await db.storage
        .from(A.bucket)
        .upload(
          `${prefix}/${v.size}.jpg`,
          new Blob([new Uint8Array(v.bytes)], { type: "image/jpeg" }),
          { contentType: "image/jpeg", upsert: false },
        );
      if (upload.error && String((upload.error as { statusCode?: string }).statusCode) !== "409")
        throw new Error("Não foi possível persistir a foto tratada.");
    }
    const still = await authorized();
    failure(still.error, "Não foi possível revalidar a foto.");
    if (!still.data) {
      await finish("invalid", { error: "A foto foi retirada durante o tratamento." });
      return { processed: true, state: "invalid" };
    }
    await finish("ready", {
      checksum: full.checksum,
      storage_prefix: prefix,
      width: full.width,
      height: full.height,
      prepared_at: new Date().toISOString(),
      variants: Object.fromEntries(
        variants.map((v) => [
          v.size,
          { checksum: v.checksum, width: v.width, height: v.height, bytes: v.bytes.length },
        ]),
      ),
    });
    return { processed: true, state: "ready" };
  } catch (error) {
    const state = error instanceof UncertainAnalysis ? "uncertain" : "failed";
    const message =
      error instanceof Error ? error.message.slice(0, 240) : "O tratamento não foi concluído.";
    await finish(state, { error: message });
    return { processed: true, state, message };
  }
}

/** Existing authenticated hourly hook; one bounded photo per run, no post-response work. */
export async function runFeatured(
  db: SupabaseClient,
  now = new Date(),
  brand: SiteBrand = "cordial",
) {
  const A = featuredAdapter(brand);
  const { data: settings, error } = await db
    .from(A.settings)
    .select("featured_policy")
    .eq("id", true)
    .maybeSingle();
  if (error) return { skipped: "indisponível" };
  const parsed = featuredPolicySchema.safeParse(settings?.featured_policy);
  if (!parsed.success || !parsed.data.enabled) return { skipped: "desligado" };
  const expired = await db
    .from(A.photos)
    .select("id,parameters")
    .eq("state", "processing")
    .lt("lease_until", now.toISOString());
  failure(expired.error, "Não foi possível conferir trabalhos interrompidos.");
  for (const p of expired.data ?? []) {
    await db
      .from(A.photos)
      .update({
        state: p.parameters ? "queued" : "uncertain",
        lease: null,
        lease_until: null,
        error: "Processamento interrompido.",
      })
      .eq("id", p.id)
      .eq("state", "processing")
      .lt("lease_until", now.toISOString());
  }
  const live = liveWeek(now, FEATURED_SCHEDULE),
    next = addWeeks(live, 1);
  const weeks = [live, ...(now >= prepareAt(next, FEATURED_SCHEDULE) ? [next] : [])];
  let worked = false;
  for (const week of weeks) {
    const result = await db
      .from(A.weeks)
      .select("id,state")
      .eq("week_start", week)
      .neq("state", "superseded")
      .maybeSingle();
    failure(result.error, "Não foi possível ler a semana de destaques.");
    let batch = result.data;
    if (!batch) {
      const id = await planFeaturedWeek(db, week, brand);
      if (!id) continue;
      batch = { id, state: "preparing" };
    }
    if (batch.state === "preparing" && !worked) {
      worked = (await processFeaturedPhoto(db, batch.id, brand)).processed;
    }
    if (week === live && ["preparing", "ready"].includes(batch.state)) {
      const activated = await db.rpc(A.activate, { _week: batch.id });
      failure(activated.error, "Não foi possível ativar a semana preparada.");
    }
  }
  return { ok: true, processed: worked };
}
