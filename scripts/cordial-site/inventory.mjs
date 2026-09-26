// Read-only audit. Credentials are supplied by the operator through environment variables.
// Reports contain internal identities: keep the output outside public/ and out of Git.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const output = process.env.SITE_AUDIT_OUTPUT || ".local/cordial-site-audit";
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: authError } = await client.auth.signInWithPassword({
  email: process.env.SITE_AUDIT_EMAIL,
  password: process.env.SITE_AUDIT_PASSWORD,
});
if (authError) throw new Error(`Audit authentication failed: ${authError.status}`);
const columns = {
  properties:
    "id,carteira,operacao,finalidade,tipo,codigo_cordial,codigo_morar,source,source_property_id,is_draft,exibir_imovel,autorizacao,disponibilidade,archived_at,removal_state,valor,valor_modo,descricao_imovel,pontos_fortes,cidade,bairro,uf,exibir_endereco_site,area_util,area_total,area_construida,area_terreno,area_privativa,area_privativa_unidade,area_total_unidade,area_construida_unidade,area_terreno_unidade,destaque_inicial,estagio_empreendimento,mobiliado,revision,updated_at,created_at",
  property_provider_publications:
    "id,property_id,provider,enabled,status,external_property_id,external_reference,external_public_url,updated_at",
  property_images:
    "id,property_id,storage_path,position,is_cover,processing_status,processed_storage_path,thumbnail_storage_path,watermark_variant,watermark_version,width,height,content_hash,processed_checksum,updated_at",
};
async function scan(table, select) {
  let cursor = null;
  const rows = [];
  while (true) {
    let q = client.from(table).select(select).order("id").limit(500);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data.length) break;
    rows.push(...data);
    cursor = data.at(-1).id;
  }
  if (new Set(rows.map((x) => x.id)).size !== rows.length) throw new Error("Duplicate identity");
  return rows;
}
const hash = (rows) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
let snapshot,
  stable = false;
const startedAt = new Date().toISOString();
for (let attempt = 0; attempt < 3; attempt++) {
  const a = {},
    b = {};
  for (const [table, select] of Object.entries(columns)) a[table] = await scan(table, select);
  for (const [table, select] of Object.entries(columns)) b[table] = await scan(table, select);
  snapshot = b;
  if (Object.keys(columns).every((table) => hash(a[table]) === hash(b[table]))) {
    stable = true;
    break;
  }
}
const freq = (rows, key) =>
  Object.fromEntries(
    [...new Set(rows.map((x) => String(x[key])))]
      .sort()
      .map((v) => [v, rows.filter((x) => String(x[key]) === v).length]),
  );
const props = snapshot.properties,
  pubs = snapshot.property_provider_publications,
  images = snapshot.property_images;
const linked = (id, provider) =>
  pubs.some((p) => p.property_id === id && p.provider === provider && p.enabled === true);
const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  stableDoubleScan: stable,
  scope: "authenticated RLS; no writes",
  counts: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
  hashes: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, hash(v)])),
  origin: freq(props, "carteira"),
  operations: freq(props, "operacao"),
  availability: freq(props, "disponibilidade"),
  authorization: freq(props, "autorizacao"),
  visibility: freq(props, "exibir_imovel"),
  removal: freq(props, "removal_state"),
  cordialEnabled: props.filter((p) => linked(p.id, "cordial")).length,
  morarOnlyEnabled: props.filter((p) => linked(p.id, "morar") && !linked(p.id, "cordial")).length,
  sharedEnabled: props.filter((p) => linked(p.id, "cordial") && linked(p.id, "morar")).length,
  drafts: props.filter((p) => p.is_draft).length,
  archived: props.filter((p) => p.archived_at).length,
  publicationStatus: freq(pubs, "status"),
  imageStatus: freq(images, "processing_status"),
  watermarks: freq(images, "watermark_variant"),
  withoutImages: props.filter((p) => !images.some((i) => i.property_id === p.id)).length,
  imageMissingDimensions: images.filter((i) => !i.width || !i.height).length,
  imageLowResolution: images.filter((i) => i.width && i.height && Math.max(i.width, i.height) < 800)
    .length,
  areaUnits: Object.fromEntries(
    [
      "area_privativa_unidade",
      "area_total_unidade",
      "area_construida_unidade",
      "area_terreno_unidade",
    ].map((k) => [k, freq(props, k)]),
  ),
  types: freq(props, "tipo"),
  furnished: freq(props, "mobiliado"),
  stages: freq(props, "estagio_empreendimento"),
};
await mkdir(output, { recursive: true });
await writeFile(`${output}/snapshot.json`, JSON.stringify(snapshot, null, 2));
await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await client.auth.signOut({ scope: "local" });
if (!stable) process.exitCode = 2;
