/** Processamento do Realce no servidor: reivindica itens com lease, chama o provedor e grava o resultado. */
import { activeProvider } from "./provider.server";
import { aiEditSize, ratioDiffers } from "./model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const MAX_ATTEMPTS = 3;

/** Lê largura/altura de JPEG (SOF) ou PNG (IHDR). */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) {
    const v = new DataView(b.buffer, b.byteOffset);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1]!;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
    i += 2 + len;
  }
  return null;
}

async function event(admin: Admin, it: { id: string; test_id: string; user_id: string }, status: string, detail?: string) {
  await admin.from("realce_item_events").insert({ item_id: it.id, test_id: it.test_id, user_id: it.user_id, status, detail: detail ?? null });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processOne(admin: Admin, it: any): Promise<"ok" | "pause" | "other"> {
  const started = Date.now();
  const dl = await admin.storage.from("realce").download(it.work_path);
  if (dl.error || !dl.data) {
    await admin.from("realce_items").update({ status: "falha", error_message: "Não foi possível ler a foto enviada.", lease_until: null, finished_at: new Date().toISOString() }).eq("id", it.id);
    await event(admin, it, "falha", "download");
    return "other";
  }
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  await event(admin, it, "processando", activeProvider.id);
  const out = await activeProvider.edit({ bytes, mime: "image/jpeg", width: it.work_width, height: it.work_height });
  const now = new Date().toISOString();
  const base = { provider: activeProvider.id, model: activeProvider.model, lease_until: null, updated_at: now };
  if (out.kind === "ok") {
    const dims = imageSize(out.bytes);
    const path = `${it.user_id}/${it.test_id}/result/${it.id}-a${it.attempts}.jpg`;
    const up = await admin.storage.from("realce").upload(path, out.bytes, { contentType: out.mime, upsert: true });
    if (up.error) {
      await admin.from("realce_items").update({ ...base, status: "incerto", error_message: "A IA respondeu, mas não foi possível guardar o resultado." }).eq("id", it.id);
      await event(admin, it, "incerto", "upload");
      return "other";
    }
    const notes: string[] = [];
    const req = aiEditSize(it.work_width, it.work_height);
    if (req.ratioClamped) notes.push("Proporção muito alongada: a IA trabalhou numa proporção aproximada.");
    if (dims && ratioDiffers(it.work_width, it.work_height, dims.width, dims.height)) notes.push("A IA devolveu uma proporção diferente da original.");
    if (dims && Math.max(dims.width, dims.height) < Math.max(it.work_width, it.work_height)) notes.push(`Resolução entregue pela IA: ${dims.width}×${dims.height} (menor que a enviada).`);
    await admin.from("realce_items").update({
      ...base, status: "pronta", result_path: path, result_width: dims?.width ?? null, result_height: dims?.height ?? null,
      result_note: notes.join(" ") || null, error_message: null, finished_at: now, duration_ms: Date.now() - started,
    }).eq("id", it.id);
    await event(admin, it, "pronta", activeProvider.id);
    return "ok";
  }
  if (out.kind === "retry" && it.attempts < MAX_ATTEMPTS) {
    const wait = out.retryAfterSec ?? 20 * 2 ** (it.attempts - 1) + Math.floor(Math.random() * 10);
    await admin.from("realce_items").update({ ...base, status: "na_fila", next_attempt_at: new Date(Date.now() + wait * 1000).toISOString(), error_message: out.message }).eq("id", it.id);
    await event(admin, it, "na_fila", "retry");
    return "other";
  }
  const status = out.kind === "uncertain" ? "incerto" : "falha";
  await admin.from("realce_items").update({ ...base, status, error_message: out.message, finished_at: now, duration_ms: Date.now() - started }).eq("id", it.id);
  await event(admin, it, status, out.kind);
  return out.kind === "fail" && out.pause ? "pause" : "other";
}

/** Processa até `limit` itens em paralelo (concorrência controlada). */
export async function runRealce(admin: Admin, opts: { limit: number; userId?: string; itemId?: string }) {
  const { data, error } = await admin.rpc("realce_claim", { p_limit: opts.limit, p_user: opts.userId ?? null, p_item: opts.itemId ?? null });
  if (error) throw new Error("claim_failed");
  const items = (data ?? []) as unknown[];
  const results = await Promise.all(items.map((it) => processOne(admin, it)));
  return { processed: items.length, paused: results.includes("pause") };
}

/** Limpeza: testes com mais de 30 dias (arquivos e registros). */
export async function cleanupRealce(admin: Admin) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: tests } = await admin.from("realce_tests").select("id,user_id").lt("created_at", cutoff).limit(5);
  for (const t of tests ?? []) {
    const { data: items } = await admin.from("realce_items").select("original_path,work_path,result_path").eq("test_id", t.id);
    const { data: listed } = await admin.storage.from("realce").list(`${t.user_id}/${t.id}/result`);
    const paths = new Set<string>();
    for (const i of items ?? []) for (const p of [i.original_path, i.work_path, i.result_path]) if (p) paths.add(p);
    for (const f of listed ?? []) paths.add(`${t.user_id}/${t.id}/result/${f.name}`);
    if (paths.size) await admin.storage.from("realce").remove([...paths]);
    await admin.from("realce_tests").delete().eq("id", t.id);
  }
}
