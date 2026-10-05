// Read-only, complete authenticated audit. Private reports stay outside public/ and Git.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.env.SITE_AUDIT_OUTPUT || ".local/morar-site-audit";
if (!output.replaceAll("\\", "/").startsWith(".local/"))
  throw Error("Use a private .local/ output directory.");
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: authError } = await client.auth.signInWithPassword({
  email: process.env.SITE_AUDIT_EMAIL,
  password: process.env.SITE_AUDIT_PASSWORD,
});
if (authError) throw Error(`Audit authentication failed (${authError.status ?? "unknown"}).`);
const selections = {
  properties:
    "id,carteira,operacao,tipo,codigo_cordial,codigo_morar,source,source_property_id,is_draft,exibir_imovel,autorizacao,disponibilidade,archived_at,removal_state,registration_completed_at,valor,valor_modo,descricao_imovel,pontos_fortes,cidade,bairro,uf,exibir_endereco_site,area_util,area_total,area_construida,area_terreno,area_privativa,area_privativa_unidade,area_total_unidade,area_construida_unidade,area_terreno_unidade,destaque_inicial,estagio_empreendimento,mobiliado,revision,updated_at,created_at",
  property_provider_publications:
    "id,property_id,provider,enabled,desired_availability,status,external_property_id,external_reference,external_public_url,updated_at",
  property_images:
    "id,property_id,storage_path,position,is_cover,processing_status,processed_storage_path,thumbnail_storage_path,watermark_variant,watermark_version,width,height,content_hash,processed_checksum,updated_at",
};
async function scan(table, select) {
  let cursor;
  const rows = [],
    ids = new Set();
  for (;;) {
    let query = client.from(table).select(select).order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error)
      throw Error(`${table}: database audit failed (${error.code}); verify the required schema.`);
    if (!data?.length) return rows;
    for (const row of data) {
      if (ids.has(row.id)) throw Error(`${table}: duplicate canonical identity.`);
      ids.add(row.id);
      rows.push(row);
    }
    cursor = data.at(-1).id;
  }
}
const digest = (rows) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
async function snapshot() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(selections).map(async ([table, select]) => [table, await scan(table, select)]),
    ),
  );
}
const startedAt = new Date().toISOString();
let data,
  stable = false;
for (let attempt = 0; attempt < 3; attempt++) {
  const a = await snapshot(),
    b = await snapshot();
  data = b;
  if (Object.keys(selections).every((table) => digest(a[table]) === digest(b[table]))) {
    stable = true;
    break;
  }
}
const active = (id, provider) =>
  data.property_provider_publications.some(
    (p) =>
      p.property_id === id &&
      p.provider === provider &&
      p.enabled === true &&
      p.desired_availability === "visible",
  );
const outcomes = data.properties.map((p) => {
  const reasons = [];
  if (!active(p.id, "morar")) reasons.push("no_active_morar_intent");
  if (p.is_draft !== false) reasons.push("draft_or_unknown");
  if (p.exibir_imovel !== true) reasons.push("hidden_or_unknown");
  if (p.archived_at) reasons.push("archived");
  if (p.removal_state) reasons.push("retiring");
  if (!["venda", "aluguel"].includes(p.operacao)) reasons.push("unsupported_operation");
  if (p.autorizacao === false) reasons.push("authorization_denied");
  if (
    p.disponibilidade != null &&
    !["sim", "disponivel", "disponível"].includes(p.disponibilidade.trim().toLowerCase())
  )
    reasons.push("unavailable");
  if (p.source === "gestao_cordial" && !p.registration_completed_at)
    reasons.push("registration_incomplete");
  const pending = [];
  if (p.autorizacao == null) pending.push("authorization_review_required");
  if (p.disponibilidade == null) pending.push("availability_review_required");
  // A candidate is never an approval: own-channel content/media/authorization review is still required.
  return {
    propertyId: p.id,
    reference: p.codigo_morar,
    shared: active(p.id, "cordial"),
    reasons,
    pending,
    status: reasons.length
      ? "excluded"
      : pending.length
        ? "pending_review"
        : "candidate_for_review",
  };
});
const frequency = (rows, key) =>
  rows.reduce((r, p) => {
    const value = String(p[key] ?? "null");
    r[value] = (r[value] ?? 0) + 1;
    return r;
  }, {});
const candidates = outcomes.filter((p) => !p.reasons.length),
  candidateIds = new Set(candidates.map((p) => p.propertyId));
const candidateImages = data.property_images.filter((i) => candidateIds.has(i.property_id));
const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  stableDoubleScan: stable,
  scope: "authenticated RLS, read-only; candidates are not published approvals",
  counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])),
  hashes: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, digest(rows)])),
  activeMorarIntent: data.properties.filter((p) => active(p.id, "morar")).length,
  morarExclusive: data.properties.filter((p) => active(p.id, "morar") && !active(p.id, "cordial"))
    .length,
  shared: data.properties.filter((p) => active(p.id, "morar") && active(p.id, "cordial")).length,
  candidatesForExplicitReview: candidates.length,
  pendingNullReview: candidates.filter((p) => p.pending.length).length,
  excluded: outcomes.filter((p) => p.reasons.length).length,
  exclusionReasons: frequency(
    outcomes.flatMap((p) => p.reasons.map((reason) => ({ reason }))),
    "reason",
  ),
  candidateOperations: frequency(
    data.properties.filter((p) => candidateIds.has(p.id)),
    "operacao",
  ),
  candidateTypes: frequency(
    data.properties.filter((p) => candidateIds.has(p.id)),
    "tipo",
  ),
  candidateImages: candidateImages.length,
  candidateImageStates: frequency(candidateImages, "processing_status"),
  candidateWatermarks: frequency(candidateImages, "watermark_variant"),
  candidateWithoutImages: candidates.filter(
    (p) => !candidateImages.some((i) => i.property_id === p.propertyId),
  ).length,
  canonicalDrafts: data.properties.filter((p) => p.is_draft).length,
  canonicalArchived: data.properties.filter((p) => p.archived_at).length,
};
await mkdir(output, { recursive: true });
await writeFile(`${output}/snapshot.json`, JSON.stringify(data, null, 2));
await writeFile(`${output}/publication-candidates.json`, JSON.stringify(outcomes, null, 2));
await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await client.auth.signOut({ scope: "local" });
if (!stable) process.exitCode = 2;
