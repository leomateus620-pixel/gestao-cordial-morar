import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { archiveDatabase } from "./database";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const SECRETARIA = randomUUID();
const CORRETOR = randomUUID();
const FINANCEIRO = randomUUID();
const SEM_PAPEL = randomUUID();

let db: PGlite;
before(async () => {
  db = await archiveDatabase();
  for (const [u, r] of [[ADMIN, "admin"], [SECRETARIA, "secretaria"], [CORRETOR, "corretor"], [FINANCEIRO, "financeiro"]]) {
    await db.query("INSERT INTO user_roles VALUES($1,$2)", [u, r]);
  }
});
after(async () => { await db?.close(); });

async function property() {
  const id = randomUUID();
  await db.query(
    "INSERT INTO properties(id,codigo_cordial,codigo_morar,cidade,bairro,tipo,valor,descricao_imovel) VALUES($1,'1400','M-77','Santa Rosa','Centro','Casa',300000,'Desc')",
    [id],
  );
  await db.query("INSERT INTO property_images(property_id,storage_path,position,is_cover) VALUES($1,'a.jpg',0,true),($1,'b.jpg',1,false)", [id]);
  return id;
}
async function link(id: string, provider: string, external = "EXT-" + provider) {
  await db.query(
    "INSERT INTO property_provider_publications(property_id,provider,enabled,status,external_property_id,publication_intent_revision,desired_availability,updated_at) VALUES($1,$2,true,'published',$3,3,'visible',now())",
    [id, provider, external],
  );
}
const one = async <T,>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0];
const request = (id: string, user: string, action = "unpublish", rev: number | null = null) =>
  one<{ r: any }>("SELECT property_retire_request($1,$2,$3,$4) r", [id, user, action, rev]).then((x) => x.r);
const finalize = (id: string, rev: number | null = null) =>
  one<{ r: any }>("SELECT property_archive_finalize($1,$2) r", [id, rev]).then((x) => x.r);
const unarchive = (id: string, user: string) =>
  one<{ r: any }>("SELECT property_unarchive($1,$2,NULL) r", [id, user]).then((x) => x.r);
const state = (id: string) => one<{ removal_state: string | null; archived_at: string | null; revision: number }>(
  "SELECT removal_state, archived_at, revision FROM properties WHERE id=$1", [id]);
/** Simula o worker confirmando a retirada (mesma gravação da RPC finish_availability). */
const confirm = (id: string, provider: string) => db.query(
  "UPDATE property_provider_publications SET status='unpublished', enabled=false WHERE property_id=$1 AND provider=$2", [id, provider]);
const snapshot = (id: string) => db.query(
  `SELECT p.codigo_cordial,p.codigo_morar,
     (SELECT json_agg(json_build_object('s',storage_path,'p',position,'c',is_cover) ORDER BY position) FROM property_images WHERE property_id=p.id) imgs,
     (SELECT json_agg(json_build_object('pr',provider,'x',external_property_id) ORDER BY provider) FROM property_provider_publications WHERE property_id=p.id) links
   FROM properties p WHERE id=$1`, [id]).then((r) => JSON.stringify(r.rows[0]));

test("corretor, secretária e admin podem arquivar; financeiro e sem papel são recusados antes de mudar", async () => {
  for (const user of [CORRETOR, SECRETARIA, ADMIN]) {
    const id = await property();
    const r = await request(id, user);
    assert.equal(r.ok, true);
    assert.equal((await finalize(id)).status, "archived");
  }
  for (const user of [FINANCEIRO, SEM_PAPEL]) {
    const id = await property();
    await assert.rejects(request(id, user), /sem_permissao/);
    const s = await state(id);
    assert.equal(s.removal_state, null);
    assert.equal(s.revision, 1);
  }
});

test("exclusão definitiva continua só para admin", async () => {
  for (const user of [CORRETOR, SECRETARIA]) {
    const id = await property();
    await assert.rejects(request(id, user, "delete"), /sem_permissao/);
  }
  const id = await property();
  assert.equal((await request(id, ADMIN, "delete")).ok, true);
});

test("sem publicação: arquiva imediatamente e preserva os dados", async () => {
  const id = await property();
  const before = await snapshot(id);
  const r = await request(id, CORRETOR);
  assert.deepEqual(r.providers, []);
  assert.equal((await finalize(id)).status, "archived");
  assert.equal(await snapshot(id), before);
  assert.ok((await state(id)).archived_at);
});

test("regressão: todos enabled=false, Cordial confirmado e Morar pendente/erro NÃO conclui", async () => {
  const id = await property();
  await link(id, "cordial"); await link(id, "morar");
  const r = await request(id, CORRETOR);
  assert.deepEqual(r.providers, ["cordial", "morar"]);
  const enabled = await db.query<{ enabled: boolean }>("SELECT enabled FROM property_provider_publications WHERE property_id=$1", [id]);
  assert.ok(enabled.rows.every((x) => x.enabled === false));
  await confirm(id, "cordial");
  assert.deepEqual(await finalize(id), { status: "pending", providers: ["morar"] });
  await db.query("UPDATE property_provider_publications SET status='error', last_error_message='timeout' WHERE property_id=$1 AND provider='morar'", [id]);
  assert.equal((await finalize(id)).status, "pending");
  assert.equal((await state(id)).removal_state, "pending_archive");
  await confirm(id, "morar");
  assert.equal((await finalize(id)).status, "archived");
});

test("apenas Morar: só esse vínculo recebe job de retirada, e IDs/códigos ficam", async () => {
  const id = await property();
  await link(id, "morar");
  const before = await snapshot(id);
  await request(id, SECRETARIA);
  const jobs = await db.query<{ provider: string; action: string }>("SELECT provider, action::text FROM property_sync_jobs WHERE property_id=$1", [id]);
  assert.deepEqual(jobs.rows, [{ provider: "morar", action: "unpublish" }]);
  await confirm(id, "morar");
  assert.equal((await finalize(id)).status, "archived");
  assert.equal(await snapshot(id), before);
});

test("criação ambígua sem ID remoto entra como destino pendente", async () => {
  const id = await property();
  await db.query("INSERT INTO property_provider_publications(property_id,provider,enabled,status,create_state) VALUES($1,'cordial',false,'error','awaiting_create_reconcile')", [id]);
  const r = await request(id, CORRETOR);
  assert.deepEqual(r.providers, ["cordial"]);
  assert.equal((await finalize(id)).status, "pending");
});

test("idempotência: pedido repetido (duas abas, retry) não cria novos jobs", async () => {
  const id = await property();
  await link(id, "cordial");
  await request(id, CORRETOR, "unpublish", 1);
  const again = await request(id, ADMIN, "unpublish", 1);
  assert.equal(again.alreadyRequested, true);
  const jobs = await one<{ n: number }>("SELECT count(*)::int n FROM property_sync_jobs WHERE property_id=$1", [id]);
  assert.equal(jobs.n, 1);
});

test("revisão antiga não arquiva depois de nova decisão", async () => {
  const id = await property();
  await link(id, "cordial");
  const r = await request(id, CORRETOR);
  await confirm(id, "cordial");
  assert.equal((await finalize(id, r.revision - 1)).status, "stale");
  // Nova decisão (publicar de novo) muda a intenção: confirmação antiga não vale.
  await db.query("UPDATE property_provider_publications SET desired_availability='visible', publication_intent_revision=publication_intent_revision+1 WHERE property_id=$1", [id]);
  assert.equal((await finalize(id)).status, "pending");
});

test("site próprio: sai do ar no pedido e reativar não republica", async () => {
  const id = await property();
  await link(id, "cordial");
  await db.query("SELECT cordial_site_sync_property($1)", [id]);
  const st = () => one<{ state: string }>("SELECT state FROM cordial_site_publications WHERE property_id=$1", [id]);
  assert.equal((await st()).state, "published");
  await request(id, CORRETOR);
  assert.equal((await st()).state, "withdrawn");
  await confirm(id, "cordial");
  await finalize(id);
  const before = await snapshot(id);
  assert.equal((await unarchive(id, CORRETOR)).ok, true);
  const s = await state(id);
  assert.equal(s.removal_state, null); assert.equal(s.archived_at, null);
  assert.equal((await st()).state, "withdrawn");
  const links = await db.query<{ enabled: boolean; status: string; desired_availability: string }>(
    "SELECT enabled,status,desired_availability FROM property_provider_publications WHERE property_id=$1", [id]);
  assert.deepEqual(links.rows, [{ enabled: false, status: "unpublished", desired_availability: "hidden" }]);
  assert.equal(await snapshot(id), before);
});

test("reativar exige perfil da equipe", async () => {
  const id = await property();
  await request(id, ADMIN); await finalize(id);
  await assert.rejects(unarchive(id, FINANCEIRO), /sem_permissao/);
  assert.equal((await state(id)).removal_state, "archived");
});
