import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describeHistoryChange, formatHistoryValue } from "../../src/lib/imoveis/history-labels";

const ADMIN = randomUUID();
const CORRETOR = randomUUID();

const SCHEMA = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','secretaria','corretor','financeiro');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS
 $$ SELECT exists(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, nome text);
CREATE TABLE public.properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tipo text, valor numeric, dormitorios int,
  updated_at timestamptz DEFAULT now(), revision int DEFAULT 1, gallery_revision int DEFAULT 0, removal_state text,
  registration_completed_at timestamptz, proprietario_nome text, proprietario_telefone text, codigo_cordial text, last_user_edit_at timestamptz);
CREATE TABLE public.property_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  position int, is_cover boolean DEFAULT false, pending_remote_delete boolean DEFAULT false, replacement_target_image_id uuid,
  processing_status text, updated_at timestamptz);
CREATE TABLE public.property_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE);
CREATE TABLE public.property_provider_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid, provider text, status text, last_error_message text);
`;

let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  for (const f of ["0037_property_history.sql", "0038_property_history_photo_merge.sql"]) await db.exec(await readFile(new URL(`../../drizzle/migrations/${f}`, import.meta.url), "utf8"));
  await db.query("INSERT INTO user_roles VALUES ($1,'admin'),($2,'corretor')", [ADMIN, CORRETOR]);
  await db.query("INSERT INTO profiles VALUES ($1,'Bianca'),($2,'Felipe')", [ADMIN, CORRETOR]);
});
after(async () => { await db?.close(); });

const as = (uid: string | null) => db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
async function newProperty() {
  await as(null);
  const id = randomUUID();
  await db.query("INSERT INTO properties(id,tipo,valor,dormitorios,proprietario_nome) VALUES ($1,'casa',300000,2,'Ana')", [id]);
  return id;
}
async function events(id: string) {
  const r = await db.query<{ category: string; title: string; actor_name: string; actor_kind: string; changes: unknown[] }>(
    "SELECT category,title,actor_name,actor_kind,changes FROM property_history WHERE property_id=$1 ORDER BY created_at, title", [id]);
  return r.rows;
}

test("criação gera evento e edição gera um evento por seção com o usuário autenticado", async () => {
  const id = await newProperty();
  await as(ADMIN);
  await db.query("UPDATE properties SET valor=350000, dormitorios=3, tipo='apartamento' WHERE id=$1", [id]);
  const rows = await events(id);
  assert.deepEqual(rows.map((r) => r.title).sort(), ["Editado Características", "Editado Valores", "Imóvel cadastrado"]);
  const carac = rows.find((r) => r.category === "caracteristicas")!;
  assert.equal(carac.actor_name, "Bianca");
  assert.equal(carac.actor_kind, "user");
  assert.equal(carac.changes.length, 2);
  assert.equal(rows.find((r) => r.category === "criacao")!.actor_name, "Sistema");
});

test("update só de campos técnicos não grava nada", async () => {
  const id = await newProperty();
  await as(null);
  await db.query("UPDATE properties SET updated_at=now()+interval '1 min', revision=revision+1, gallery_revision=5, last_user_edit_at=now() WHERE id=$1", [id]);
  assert.equal((await events(id)).length, 1);
});

test("sem usuário vira Sistema; vários salvamentos na mesma transação são fundidos", async () => {
  const id = await newProperty();
  await as(null);
  await db.exec(`BEGIN; UPDATE properties SET valor=1 WHERE id='${id}'; UPDATE properties SET valor=2 WHERE id='${id}'; COMMIT;`);
  const v = (await events(id)).filter((r) => r.category === "valores");
  assert.equal(v.length, 1);
  assert.equal(v[0].actor_name, "Sistema");
  assert.deepEqual(v[0].changes, [{ field: "valor", from: 300000, to: 2, sensitive: false }]);
});

test("reordenar N fotos gera um único evento e totais aparecem", async () => {
  const id = await newProperty();
  await as(ADMIN);
  await db.query("INSERT INTO property_images(property_id,position,is_cover) VALUES ($1,0,true),($1,1,false),($1,2,false)", [id]);
  await db.exec(`BEGIN;
    UPDATE property_images SET position = 2 - position WHERE property_id='${id}';
    UPDATE property_images SET is_cover = (position = 0) WHERE property_id='${id}';
    COMMIT;`);
  await db.query("UPDATE property_images SET processing_status='ready' WHERE property_id=$1", [id]);
  const fotos = (await events(id)).filter((r) => r.category === "fotos").map((r) => r.title);
  assert.deepEqual(fotos.sort(), ["3 imagens adicionadas (Total: 3)", "Ordem das imagens alterada"]);
});

test("dados privados: corretor vê sem valores, admin vê valores", async () => {
  const id = await newProperty();
  await as(ADMIN);
  await db.query("UPDATE properties SET proprietario_telefone='55999990000' WHERE id=$1", [id]);
  await as(CORRETOR);
  const c = await db.query<{ changes: Array<Record<string, unknown>>; private_hidden: boolean }>(
    "SELECT changes, private_hidden FROM property_history_list($1) WHERE category='dados_privados'", [id]);
  assert.equal(c.rows[0].private_hidden, true);
  assert.equal("to" in c.rows[0].changes[0], false);
  assert.doesNotMatch(JSON.stringify(c.rows), /55999990000/);
  await as(ADMIN);
  const a = await db.query<{ changes: Array<Record<string, unknown>> }>(
    "SELECT changes FROM property_history_list($1) WHERE category='dados_privados'", [id]);
  assert.equal(a.rows[0].changes[0].to, "55999990000");
});

test("quem não tem papel não lê; navegador não grava direto", async () => {
  const id = await newProperty();
  await as(randomUUID());
  await assert.rejects(db.query("SELECT * FROM property_history_list($1)", [id]), /Sem permissão/);
  await as(null);
  await db.exec("SET ROLE authenticated");
  try {
    await assert.rejects(db.query("INSERT INTO property_history(property_id,category,title) VALUES ($1,'valores','x')", [id]));
    await assert.rejects(db.query("DELETE FROM property_history"));
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("publicação: só transição relevante, sem repetir o mesmo estado", async () => {
  const id = await newProperty();
  await db.query("INSERT INTO property_provider_publications(property_id,provider,status) VALUES ($1,'cordial','pending')", [id]);
  for (const s of ["error", "syncing", "error", "published"]) {
    await db.query("UPDATE property_provider_publications SET status=$2 WHERE property_id=$1", [id, s]);
  }
  const pub = (await events(id)).filter((r) => r.category === "publicacao").map((r) => r.title);
  assert.deepEqual(pub.sort(), ["Erro ao publicar no site Cordial", "Publicado no site Cordial"]);
});

test("formatação legível", () => {
  assert.equal(formatHistoryValue("valor", 350000), "R$\u00a0350.000,00");
  assert.equal(formatHistoryValue("permuta", true), "Sim");
  assert.equal(formatHistoryValue("area_total", 120.5), "120,5 m²");
  assert.equal(formatHistoryValue("operacao", "aluguel"), "Aluguel");
  assert.equal(describeHistoryChange({ field: "dormitorios", from: 2, to: 3 }), "Dormitórios: 2 → 3");
  assert.equal(describeHistoryChange({ field: "proprietario_telefone", sensitive: true }), "Telefone do proprietário: alterado");
});
