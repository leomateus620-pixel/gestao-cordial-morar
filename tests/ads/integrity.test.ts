import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ADMIN = randomUUID(),
  SECRETARY = randomUUID(),
  BROKER = randomUUID(),
  OTHER_BROKER = randomUUID();
let db: PGlite;
let migrationFolder: string;
const base = `
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','secretaria','corretor','financeiro');
CREATE TABLE public.user_roles(user_id uuid,role app_role);
CREATE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,nome text);CREATE TABLE user_agencies(user_id uuid,agency text);
CREATE FUNCTION has_notification_agency_access(_user_id uuid,_agency text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM user_agencies WHERE user_id=_user_id AND agency=_agency) $$;
CREATE FUNCTION _try_uuid(v text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN v::uuid;EXCEPTION WHEN OTHERS THEN RETURN NULL;END $$;
CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),carteira text DEFAULT 'cordial',publish_targets text[] DEFAULT '{}');CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb);
`;
before(async () => {
  db = new PGlite();
  await db.exec(base);
  const files = [
    "supabase/migrations/20260623164154_300122c8-e893-41e9-b156-8d3957f43d39.sql",
    "supabase/migrations/20260623165615_33d18d7c-c7f7-4d96-af7c-886e9e298b5c.sql",
    "supabase/migrations/20260706130707_383a3dde-77b5-4274-8f4c-b7da25f2118b.sql",
  ];
  for (const file of files) {
    let sql = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    if (file.includes("20260706130707"))
      sql = sql.slice(
        sql.indexOf("-- ---------- marketing_campaigns"),
        sql.indexOf("-- ---------- Auxiliary indexes"),
      );
    await db.exec(sql);
  }
  await db.exec(
    "ALTER TABLE attendances ADD COLUMN fonte_prospeccao text,ADD COLUMN pipeline_stage text,ADD COLUMN imovel_ref text,ADD COLUMN interesse_descricao text;",
  );
  await db.exec(
    await readFile(
      new URL("../../drizzle/migrations/0009_marketing_ads_connectors.sql", import.meta.url),
      "utf8",
    ),
  );
  const journal = JSON.parse(
    await readFile(new URL("../../drizzle/migrations/meta/_journal.json", import.meta.url), "utf8"),
  ) as { entries: Array<{ idx: number; when: number; tag: string }> };
  const previous = journal.entries.find((entry) => entry.idx === 38)!;
  const target = journal.entries.find((entry) => entry.idx === 39)!;
  assert.equal(target.tag, "0039_meta_ads_leadgen");
  // Copy the exact real journal entry and SQL into an isolated migrator fixture,
  // so future migrations outside this integration cannot alter this baseline test.
  migrationFolder = await mkdtemp(join(tmpdir(), "meta-ads-journal-"));
  await mkdir(join(migrationFolder, "meta"));
  await writeFile(
    join(migrationFolder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries: [target] }),
  );
  await copyFile(
    fileURLToPath(new URL("../../drizzle/migrations/0039_meta_ads_leadgen.sql", import.meta.url)),
    join(migrationFolder, `${target.tag}.sql`),
  );

  await db.exec(
    "CREATE SCHEMA drizzle;CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
  );
  // Model the verified live journal at 0038; the real migrator must apply only 0039.
  await db.query(
    "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('verified-baseline-0038',$1)",
    [previous.when],
  );
  await migrate(drizzle(db), {
    migrationsFolder: migrationFolder,
  });

  // Execute the existing notification/assignment triggers (no parallel notification implementation).
  await db.exec(`CREATE TYPE attendance_assignment_status AS ENUM('pending_open','cancelled','superseded');
  CREATE TABLE attendance_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attendance_id uuid REFERENCES attendances(id) ON DELETE CASCADE,broker_id uuid,assigned_by uuid,assigned_at timestamptz DEFAULT now(),imobiliaria text,status attendance_assignment_status DEFAULT 'pending_open',superseded_at timestamptz,cancelled_at timestamptz);
  CREATE TABLE attendance_history(id uuid DEFAULT gen_random_uuid(),attendance_id uuid,client_id uuid,event_type text,actor_id uuid,description text,new_value jsonb,previous_value jsonb,source text);
  CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,tipo text,category text,titulo text,mensagem text,link text,imobiliaria text,entity_type text,entity_id uuid,assignment_id uuid,actor_id uuid,dedup_key text,lida boolean DEFAULT false,read_at timestamptz);
  CREATE UNIQUE INDEX notifications_dedup_key_uidx ON notifications(dedup_key) WHERE dedup_key IS NOT NULL;`);
  const notificationSql = await readFile(
    new URL(
      "../../supabase/migrations/20260728034224_9d1c2eb8-19fa-473c-9eda-cdd9707505a7.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const name of [
    "attendances_sync_assignments",
    "notifications_normalize_insert",
    "notify_atendimento_corretor",
  ]) {
    const start = notificationSql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
    await db.exec(notificationSql.slice(start, notificationSql.indexOf("\n$$;", start) + 4));
  }
  await db.exec(`CREATE TRIGGER attendances_sync_assignments_trg AFTER INSERT OR UPDATE OF corretor_id,imobiliaria ON attendances FOR EACH ROW EXECUTE FUNCTION attendances_sync_assignments();
  CREATE TRIGGER notifications_normalize_insert_trg BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION notifications_normalize_insert();
  CREATE TRIGGER trg_notify_atendimento_corretor AFTER INSERT OR UPDATE OF corretor_id,imobiliaria ON attendances FOR EACH ROW EXECUTE FUNCTION notify_atendimento_corretor();`);

  for (const [uid, role, agency] of [
    [ADMIN, "admin", "cordial"],
    [SECRETARY, "secretaria", "cordial"],
    [BROKER, "corretor", "cordial"],
    [OTHER_BROKER, "corretor", "morar"],
  ]) {
    await db.query("INSERT INTO auth.users VALUES($1);", [uid]);
    await db.query("INSERT INTO profiles VALUES($1,$2)", [uid, role]);
    await db.query("INSERT INTO user_roles VALUES($1,$2::app_role)", [uid, role]);
    await db.query("INSERT INTO user_agencies VALUES($1,$2)", [uid, agency]);
  }
});
after(async () => {
  await db?.close();
  if (migrationFolder) await rm(migrationFolder, { recursive: true, force: true });
});
const as = (uid: string) => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
async function connection(page = "456", account = "555", agency = "cordial") {
  const result = await db.query<{ id: string }>(
    "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,app_id,page_id,external_account_id) VALUES($1,'meta',$2,'system_user','123',$3,$4) RETURNING id",
    [ADMIN, agency, page, account],
  );
  return result.rows[0].id;
}
async function ingest(page: string, lead: string, form = "111") {
  await db.query("SELECT meta_lead_ingest('123',$1::jsonb)", [
    JSON.stringify([{ page_id: page, leadgen_id: lead, form_id: form }]),
  ]);
  const result = await db.query<{ id: string }>(
    "SELECT id FROM meta_lead_submissions WHERE page_id=$1 AND leadgen_id=$2",
    [page, lead],
  );
  return result.rows[0].id;
}
async function claim() {
  const worker = randomUUID();
  const r = await db.query<{ id: string }>("SELECT id FROM meta_lead_claim($1,10)", [worker]);
  return { worker, rows: r.rows };
}
async function mapped(conn: string, page: string, form = "111") {
  await db.query(
    "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,created_by,finalidade,tipo_imovel) VALUES($1,$2,$3,'cordial',$4,'compra','casa')",
    [conn, page, form, ADMIN],
  );
}
const fields = (phone = "+5511999990000", email = "ana@example.test") =>
  JSON.stringify({ full_name: "Ana", phone, email, field_data: [] });

test("webhook duplicate + unknown Page duráveis e isolados", async () => {
  const conn = await connection();
  assert.ok(conn);
  const id = await ingest("456", "789");
  assert.equal(await ingest("456", "789"), id);
  const unknown = await ingest("999", "790");
  const result = await db.query<{
    status: string;
    imobiliaria: string | null;
    connection_id: string | null;
  }>("SELECT status,imobiliaria,connection_id FROM meta_lead_submissions WHERE id=$1", [unknown]);
  assert.equal(result.rows[0].status, "quarantined");
  assert.equal(result.rows[0].imobiliaria, null);
  assert.equal(result.rows[0].connection_id, null);
});
test("claim atômico não entrega um lease vivo para outro worker; lease vencido recupera", async () => {
  const first = await claim();
  assert.ok(first.rows.length);
  const second = await claim();
  assert.equal(second.rows.length, 0);
  await db.query(
    "UPDATE meta_lead_submissions SET lease_until=now()-interval '1 second' WHERE id=$1",
    [first.rows[0].id],
  );
  const third = await claim();
  assert.equal(third.rows.length, 1);
  await assert.rejects(
    db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [
      first.rows[0].id,
      first.worker,
      fields(),
    ]),
    /Stale lead lease/,
  );
  const result = await db.query<{ meta_lead_complete: string }>(
    "SELECT meta_lead_complete($1,$2,$3::jsonb)",
    [third.rows[0].id, third.worker, fields()],
  );
  assert.equal(result.rows[0].meta_lead_complete, "review");
});
test("CRM+vínculo atômico, mesma intenção não duplica e novo contato aberto vai para revisão", async () => {
  const conn = await connection("460", "556");
  await mapped(conn, "460");
  const lead = await ingest("460", "800");
  const batch = await claim();
  await db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [lead, batch.worker, fields()]);
  const linked = await db.query<{ attendance_id: string; status: string }>(
    "SELECT attendance_id,status FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.ok(linked.rows[0].attendance_id);
  assert.equal(linked.rows[0].status, "unassigned");
  await assert.rejects(
    db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [lead, batch.worker, fields()]),
    /Stale lead lease/,
  );
  const newer = await ingest("460", "801");
  const next = await claim();
  await db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [newer, next.worker, fields()]);
  const reviewed = await db.query<{ status: string; attendance_id: string | null }>(
    "SELECT status,attendance_id FROM meta_lead_submissions WHERE id=$1",
    [newer],
  );
  assert.equal(reviewed.rows[0].status, "review");
  assert.equal(reviewed.rows[0].attendance_id, null);
  const count = await db.query<{ count: number }>(
    "SELECT count(*)::int count FROM attendances WHERE telefone='+5511999990000'",
  );
  assert.equal(count.rows[0].count, 1);
  await assert.rejects(
    db.query("SELECT meta_lead_assign($1,$2,$3)", [lead, OTHER_BROKER, ADMIN]),
    /Broker outside agency/,
  );
  await db.query("SELECT meta_lead_assign($1,$2,$3)", [lead, BROKER, ADMIN]);
  await assert.rejects(
    db.query("SELECT meta_lead_assign($1,$2,$3)", [lead, BROKER, ADMIN]),
    /already assigned/,
  );
  const notices = await db.query<{ count: number }>(
    "SELECT count(*)::int count FROM notifications WHERE entity_id=$1 AND user_id=$2",
    [linked.rows[0].attendance_id, BROKER],
  );
  assert.equal(notices.rows[0].count, 1);
});
test("rollback após erro no CRM não conclui lead nem cria atendimento", async () => {
  const conn = await connection("461", "557");
  await mapped(conn, "461");
  const lead = await ingest("461", "802");
  const batch = await claim();
  await db.exec(
    "ALTER TABLE attendances ADD CONSTRAINT intentional_test_error CHECK(cliente_nome<>'Fail')",
  );
  await assert.rejects(
    db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [
      lead,
      batch.worker,
      JSON.stringify({ full_name: "Fail", phone: "+5511999990022", field_data: [] }),
    ]),
  );
  const r = await db.query<{ status: string; full_name: string | null }>(
    "SELECT status,full_name FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.equal(r.rows[0].status, "processing");
  assert.equal(r.rows[0].full_name, null);
  await db.exec("ALTER TABLE attendances DROP CONSTRAINT intentional_test_error");
  await db.query("UPDATE meta_lead_submissions SET status='failed' WHERE id=$1", [lead]);
});
test("papéis reais: leitura direta negada e RPC redige valores financeiros", async () => {
  const r = await db.query<{ id: string }>(
    "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,investimento) VALUES($1,'cordial','Campanha','Facebook','Leads','2026-10-01','2026-10-31',123.45) RETURNING id",
    [ADMIN],
  );
  await db.query(
    "INSERT INTO marketing_daily_metrics(campaign_id,user_id,data,investimento,spend,cpc,cpm,leads) VALUES($1,$2,'2026-10-10',123.45,123.45,4,10,2)",
    [r.rows[0].id, ADMIN],
  );
  for (const uid of [SECRETARY, BROKER]) {
    await as(uid);
    await db.exec("SET ROLE authenticated");
    try {
      await assert.rejects(
        db.query("SELECT investimento FROM marketing_campaigns"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT spend FROM marketing_daily_metrics"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT field_data FROM meta_lead_submissions"),
        /permission denied/,
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  await as(SECRETARY);
  await db.exec("SET ROLE authenticated");
  try {
    const safe = await db.query<{
      result: {
        items: Array<{ investimento: null; daily_metrics: Array<{ spend: null; cpc: null }> }>;
      };
    }>("SELECT marketing_campaigns_safe() result");
    assert.equal(safe.rows[0].result.items[0].investimento, null);
    assert.equal(safe.rows[0].result.items[0].daily_metrics[0].spend, null);
    assert.equal(safe.rows[0].result.items[0].daily_metrics[0].cpc, null);
  } finally {
    await db.exec("RESET ROLE");
  }
  await as(BROKER);
  await db.exec("SET ROLE authenticated");
  try {
    await assert.rejects(db.query("SELECT marketing_campaigns_safe()"), /Sem permissão/);
  } finally {
    await db.exec("RESET ROLE");
  }
  await as(ADMIN);
  const full = await db.query<{ result: { items: Array<{ investimento: number }> } }>(
    "SELECT marketing_campaigns_safe() result",
  );
  assert.equal(full.rows[0].result.items[0].investimento, 123.45);
});

test("sincronização confirma lease, preserva manual e faz commit indivisível", async () => {
  await as(ADMIN);
  const conn = await connection("470", "570");
  const account = await db.query<{ id: string }>(
    "INSERT INTO ad_accounts(connection_id,platform,external_account_id,currency,timezone) VALUES($1,'meta','570','BRL','America/Sao_Paulo') RETURNING id",
    [conn],
  );
  const camp = await db.query<{ id: string }>(
    "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,platform,external_campaign_id,external_account_id,connection_id,ad_account_id) VALUES($1,'cordial','Meta','Facebook','Leads','2026-10-01','2026-10-31','meta','888','570',$2,$3) RETURNING id",
    [ADMIN, conn, account.rows[0].id],
  );
  const cid = camp.rows[0].id;
  const job = await db.query<{ id: string }>(
    "SELECT ad_sync_enqueue($1,'2026-10-01','2026-10-31',$2) id",
    [cid, ADMIN],
  );
  const duplicate = await db.query<{ id: string }>(
    "SELECT ad_sync_enqueue($1,'2026-10-01','2026-10-31',$2) id",
    [cid, ADMIN],
  );
  assert.equal(job.rows[0].id, duplicate.rows[0].id);
  const worker = randomUUID();
  await db.query("SELECT ad_sync_claim($1,1)", [worker]);
  const metrics = JSON.stringify([
    { date: "2026-10-10", spend: 10, leads: 2, clicks: 20, impressions: 100 },
  ]);
  await assert.rejects(
    db.query("SELECT ad_sync_commit($1,$2,$3::jsonb,$4::jsonb)", [
      job.rows[0].id,
      randomUUID(),
      metrics,
      "{}",
    ]),
    /Stale sync lease/,
  );
  await db.query(
    "INSERT INTO marketing_daily_metrics(campaign_id,user_id,data,metric_source) VALUES($1,$2,'2026-10-10','manual')",
    [cid, ADMIN],
  );
  await assert.rejects(
    db.query("SELECT ad_sync_commit($1,$2,$3::jsonb,$4::jsonb)", [
      job.rows[0].id,
      worker,
      metrics,
      "{}",
    ]),
    /Manual metrics/,
  );
  await db.query("DELETE FROM marketing_daily_metrics WHERE campaign_id=$1", [cid]);
  await db.query("SELECT ad_sync_commit($1,$2,$3::jsonb,$4::jsonb)", [
    job.rows[0].id,
    worker,
    metrics,
    JSON.stringify({
      nome: "Meta API",
      period_insights: {
        since: "2026-10-01",
        until: "2026-10-31",
        reach: 70,
        frequency: 1.4,
        spend: 10,
      },
    }),
  ]);
  const r = await db.query<{ investimento: number; sync_status: string }>(
    "SELECT investimento,sync_status FROM marketing_campaigns WHERE id=$1",
    [cid],
  );
  assert.equal(Number(r.rows[0].investimento), 10);
  assert.equal(r.rows[0].sync_status, "synced");
  const again = await db.query<{ id: string }>(
    "SELECT ad_sync_enqueue($1,'2026-10-01','2026-10-31',$2) id",
    [cid, ADMIN],
  );
  await db.query("SELECT ad_sync_claim($1,1)", [worker]);
  await db.query("SELECT ad_sync_commit($1,$2,'[]'::jsonb,$3::jsonb)", [
    again.rows[0].id,
    worker,
    "{}",
  ]);
  const removed = await db.query<{ count: number }>(
    "SELECT count(*)::int count FROM marketing_daily_metrics WHERE campaign_id=$1",
    [cid],
  );
  assert.equal(removed.rows[0].count, 0);
});
test("resumo usa escopo completo, moeda e período; alcance diário nunca é somado", async () => {
  await as(ADMIN);
  const safe = await db.query<{
    result: {
      total: number;
      items: unknown[];
      summary: { current: { spend: number | null; leads: number; has_data: boolean } };
    };
  }>(
    "SELECT marketing_campaigns_safe(p_since=>'2026-10-01',p_until=>'2026-10-31',p_page_size=>1) result",
  );
  assert.equal(safe.rows[0].result.items.length, 1);
  assert.ok(safe.rows[0].result.total > 1);
  assert.equal(safe.rows[0].result.summary.current.spend, null); // synced account has no metrics, never silently sum a subset
  const helper = await db.query<{ r: { spend: number; has_data: boolean } }>(
    "SELECT marketing_summary_for_period(ARRAY(SELECT id FROM marketing_campaigns WHERE platform IS NULL),'2026-10-01','2026-10-31',true) r",
  );
  assert.equal(helper.rows[0].r.spend, 123.45);
  const partial = await db.query<{ r: { spend: number | null } }>(
    "SELECT marketing_summary_for_period(ARRAY(SELECT id FROM marketing_campaigns WHERE platform IS NULL),'2026-10-20','2026-10-31',true) r",
  );
  assert.equal(partial.rows[0].r.spend, null);
});
test("exclusão CRM apaga PII e mantém tombstone que não pode reidratar", async () => {
  const linked = await db.query<{ id: string; attendance_id: string }>(
    "SELECT id,attendance_id FROM meta_lead_submissions WHERE attendance_id IS NOT NULL LIMIT 1",
  );
  assert.ok(linked.rows[0]);
  await db.query("DELETE FROM attendances WHERE id=$1", [linked.rows[0].attendance_id]);
  const r = await db.query<{
    full_name: null;
    phone: null;
    email: null;
    field_data: null;
    privacy_deleted_at: string;
    leadgen_id: string;
  }>(
    "SELECT full_name,phone,email,field_data,privacy_deleted_at,leadgen_id FROM meta_lead_submissions WHERE id=$1",
    [linked.rows[0].id],
  );
  assert.equal(r.rows[0].full_name, null);
  assert.equal(r.rows[0].phone, null);
  assert.equal(r.rows[0].field_data, null);
  assert.ok(r.rows[0].privacy_deleted_at);
  assert.ok(r.rows[0].leadgen_id);
  await assert.rejects(
    db.query("SELECT meta_lead_retry($1)", [linked.rows[0].id]),
    /cannot be retried/,
  );
});

test("escopo de conta/marca e moedas diferentes não se misturam", async () => {
  await as(ADMIN);
  const conn = await connection("480", "580", "morar");
  const account = await db.query<{ id: string }>(
    "INSERT INTO ad_accounts(connection_id,platform,external_account_id,currency,timezone) VALUES($1,'meta','580','USD','America/New_York') RETURNING id",
    [conn],
  );
  await assert.rejects(
    db.query(
      "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,platform,external_campaign_id,external_account_id,connection_id,ad_account_id) VALUES($1,'cordial','Wrong','Facebook','Leads','2026-10-01','2026-10-31','meta','999','580',$2,$3)",
      [ADMIN, conn, account.rows[0].id],
    ),
    /scope|mismatch/i,
  );
  const campaign = await db.query<{ id: string }>(
    "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,platform,external_campaign_id,external_account_id,connection_id,ad_account_id) VALUES($1,'morar','USD','Facebook','Leads','2026-10-01','2026-10-31','meta','999','580',$2,$3) RETURNING id",
    [ADMIN, conn, account.rows[0].id],
  );
  await db.query(
    "INSERT INTO marketing_daily_metrics(campaign_id,user_id,data,metric_source,spend,leads) VALUES($1,$2,'2026-10-11','synced',100,3)",
    [campaign.rows[0].id, ADMIN],
  );
  const mixed = await db.query<{
    r: { summary: { current: { spend: null; currencies: string[] } } };
  }>("SELECT marketing_campaigns_safe(p_since=>'2026-10-01',p_until=>'2026-10-31') r");
  assert.equal(mixed.rows[0].r.summary.current.spend, null);
  assert.deepEqual(mixed.rows[0].r.summary.current.currencies.sort(), ["BRL", "USD"]);
  const usd = await db.query<{
    r: {
      items: Array<{ timezone: string }>;
      summary: { current: { spend: number; currencies: string[] } };
    };
  }>(
    "SELECT marketing_campaigns_safe(p_since=>'2026-10-01',p_until=>'2026-10-31',p_account_id=>'580') r",
  );
  assert.equal(usd.rows[0].r.summary.current.spend, 100);
  assert.equal(usd.rows[0].r.items[0].timezone, "America/New_York");
  await as(SECRETARY);
  await db.exec("SET ROLE authenticated");
  try {
    const safe = await db.query<{
      r: { items: Array<{ imobiliaria: string }>; summary: { current: { spend: null } } };
    }>("SELECT marketing_campaigns_safe() r");
    assert.ok(safe.rows[0].r.items.every((row) => row.imobiliaria === "cordial"));
    assert.equal(safe.rows[0].r.summary.current.spend, null);
    const connections = await db.query("SELECT * FROM ad_connections_public()");
    assert.equal(connections.rows.length, 0);
  } finally {
    await db.exec("RESET ROLE");
  }
});
test("OAuth state expira e só pode ser consumido uma vez", async () => {
  await db.query(
    "INSERT INTO ad_oauth_states(nonce_hash,user_id,platform,imobiliaria,expires_at) VALUES('nonce',$1,'google','cordial',now()+interval '1 minute'),('expired',$1,'meta','cordial',now()-interval '1 minute')",
    [ADMIN],
  );
  const first = await db.query<{ r: boolean }>("SELECT ad_oauth_consume('nonce',$1) r", [ADMIN]);
  assert.equal(first.rows[0].r, true);
  const repeated = await db.query<{ r: boolean }>("SELECT ad_oauth_consume('nonce',$1) r", [ADMIN]);
  assert.equal(repeated.rows[0].r, false);
  const expired = await db.query<{ r: boolean }>("SELECT ad_oauth_consume('expired',$1) r", [
    ADMIN,
  ]);
  assert.equal(expired.rows[0].r, false);
  await db.exec("SET ROLE authenticated");
  try {
    await assert.rejects(
      db.query("SELECT ad_oauth_consume('nonce',$1)", [ADMIN]),
      /permission denied/,
    );
  } finally {
    await db.exec("RESET ROLE");
  }
});
test("última tentativa interrompida torna falha visível em vez de lease preso", async () => {
  await as(ADMIN);
  const lead = await ingest("460", "850");
  await db.query(
    "UPDATE meta_lead_submissions SET status='processing',attempts=8,worker_id=$2,lease_until=now()-interval '1 second' WHERE id=$1",
    [lead, randomUUID()],
  );
  await claim();
  const result = await db.query<{ status: string; last_error: string }>(
    "SELECT status,last_error FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.equal(result.rows[0].status, "failed");
  assert.equal(result.rows[0].last_error, "attempts_exhausted");
});

test("mapeamento e processamento rejeitam imóvel de outra marca", async () => {
  await as(ADMIN);
  const conn = await connection("490", "590");
  const prop = await db.query<{ id: string }>(
    "INSERT INTO properties(carteira) VALUES('morar') RETURNING id",
  );
  await assert.rejects(
    db.query(
      "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,created_by,finalidade,tipo_imovel,property_id) VALUES($1,'490','111','cordial',$2,'compra','casa',$3)",
      [conn, ADMIN, prop.rows[0].id],
    ),
    /Property outside agency/,
  );
  await db.query("UPDATE properties SET carteira='cordial' WHERE id=$1", [prop.rows[0].id]);
  await db.query(
    "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,created_by,finalidade,tipo_imovel,property_id) VALUES($1,'490','111','cordial',$2,'compra','casa',$3)",
    [conn, ADMIN, prop.rows[0].id],
  );
  await db.query("UPDATE properties SET carteira='morar' WHERE id=$1", [prop.rows[0].id]);
  const lead = await ingest("490", "900");
  const batch = await claim();
  await db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [
    lead,
    batch.worker,
    fields("+5511999990900"),
  ]);
  const r = await db.query<{ status: string; last_error: string }>(
    "SELECT status,last_error FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.equal(r.rows[0].status, "review");
  assert.equal(r.rows[0].last_error, "property_outside_agency");
});
test("contato divergente nunca vincula cliente automaticamente", async () => {
  const conn = await connection("491", "591");
  await mapped(conn, "491");
  await db.query(
    "INSERT INTO clients(created_by,brand,full_name,phone,email) VALUES($1,'cordial','Original','+5511999990910','original@example.test')",
    [ADMIN],
  );
  const lead = await ingest("491", "910");
  const batch = await claim();
  await db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [
    lead,
    batch.worker,
    fields("+5511999990910", "different@example.test"),
  ]);
  const r = await db.query<{ status: string; last_error: string; client_id: null }>(
    "SELECT status,last_error,client_id FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.equal(r.rows[0].status, "review");
  assert.equal(r.rows[0].last_error, "conflicting_contact_details");
  assert.equal(r.rows[0].client_id, null);
});

test("papel efetivo financeiro+secretaria não ganha marketing nem leads", async () => {
  const mixed = randomUUID();
  await db.query("INSERT INTO auth.users VALUES($1)", [mixed]);
  await db.query("INSERT INTO profiles VALUES($1,'Mixed')", [mixed]);
  await db.query("INSERT INTO user_roles VALUES($1,'financeiro'),($1,'secretaria')", [mixed]);
  await db.query("INSERT INTO user_agencies VALUES($1,'cordial')", [mixed]);
  await as(mixed);
  await db.exec("SET ROLE authenticated");
  try {
    const access = await db.query<{ allowed: boolean }>(
      "SELECT marketing_can_operate('cordial') allowed",
    );
    assert.equal(access.rows[0].allowed, false);
    await assert.rejects(db.query("SELECT marketing_campaigns_safe()"), /Sem permissão/);
    await assert.rejects(
      db.query("SELECT full_name FROM meta_lead_submissions"),
      /permission denied/,
    );
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("identidade telefônica preserva DDI e não funde internacional com nacional parecido", async () => {
  const r = await db.query<{
    br: string;
    national: string;
    international: string;
    similar: string;
  }>(
    "SELECT meta_phone_identity('+5511999990011') br,meta_phone_identity('11999990011') national,meta_phone_identity('+14155551234') international,meta_phone_identity('14155551234') similar",
  );
  assert.equal(r.rows[0].br, r.rows[0].national);
  assert.notEqual(r.rows[0].international, r.rows[0].similar);
});

test("journal Drizzle aplica 0039 uma vez e repetir não recria objetos", async () => {
  const before = await db.query<{ count: number }>(
    "SELECT count(*)::int count FROM drizzle.__drizzle_migrations",
  );
  assert.equal(before.rows[0].count, 2);
  await migrate(drizzle(db), {
    migrationsFolder: migrationFolder,
  });
  const after = await db.query<{ count: number }>(
    "SELECT count(*)::int count FROM drizzle.__drizzle_migrations",
  );
  assert.equal(after.rows[0].count, 2);
  const fks = await db.query<{ conname: string }>(
    "SELECT conname FROM pg_constraint WHERE conrelid='public.ad_sync_jobs'::regclass AND contype='f'",
  );
  assert.ok(fks.rows.some((row) => row.conname === "ad_sync_jobs_campaign_account_fkey"));
});
test("duas campanhas da mesma conta não recebem dois leases vivos", async () => {
  await as(ADMIN);
  const conn = await connection("495", "595");
  const account = await db.query<{ id: string }>(
    "INSERT INTO ad_accounts(connection_id,platform,external_account_id,currency,timezone) VALUES($1,'meta','595','BRL','America/Sao_Paulo') RETURNING id",
    [conn],
  );
  const campaigns: string[] = [];
  for (const external of ["1001", "1002"]) {
    const row = await db.query<{ id: string }>(
      "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,platform,external_campaign_id,external_account_id,connection_id,ad_account_id) VALUES($1,'cordial','Account queue','Facebook','Leads','2026-10-01','2026-10-31','meta',$4,'595',$2,$3) RETURNING id",
      [ADMIN, conn, account.rows[0].id, external],
    );
    campaigns.push(row.rows[0].id);
    await db.query("SELECT ad_sync_enqueue($1,'2026-10-01','2026-10-31',$2)", [
      row.rows[0].id,
      ADMIN,
    ]);
  }
  const workers = [randomUUID(), randomUUID()];
  const claimed = await Promise.all(
    workers.map((worker) =>
      db.query<{ id: string; campaign_id: string; worker_id: string }>(
        "SELECT id,campaign_id,worker_id FROM ad_sync_claim($1,5)",
        [worker],
      ),
    ),
  );
  const ours = claimed
    .flatMap((result) => result.rows)
    .filter((row) => campaigns.includes(row.campaign_id));
  assert.equal(ours.length, 1);
  const pending = await db.query<{ id: string }>(
    "SELECT id FROM ad_sync_jobs WHERE ad_account_id=$1 AND status='queued'",
    [account.rows[0].id],
  );
  assert.equal(pending.rows.length, 1);
  // The unique index also rejects bypassing the claim RPC with another running row.
  await assert.rejects(
    db.query(
      "UPDATE ad_sync_jobs SET status='running',worker_id=$2,lease_until=now()+interval '5 minutes' WHERE id=$1",
      [pending.rows[0].id, randomUUID()],
    ),
    /ad_sync_running_account_uidx/,
  );
  const first = ours[0];
  await db.query("SELECT ad_sync_fail($1,$2,'error','provider_error',now())", [
    first.id,
    first.worker_id,
  ]);
  const nextWorker = randomUUID();
  const next = await db.query<{ id: string; worker_id: string }>(
    "SELECT id,worker_id FROM ad_sync_claim($1,5)",
    [nextWorker],
  );
  assert.ok(next.rows.some((row) => row.id === pending.rows[0].id));
  await db.query("UPDATE ad_sync_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [
    pending.rows[0].id,
  ]);
  const resumed = await db.query<{ id: string }>("SELECT id FROM ad_sync_claim($1,5)", [
    randomUUID(),
  ]);
  assert.ok(resumed.rows.some((row) => row.id === pending.rows[0].id));
  await assert.rejects(
    db.query("SELECT ad_sync_fail($1,$2,'error','provider_error',now())", [
      pending.rows[0].id,
      nextWorker,
    ]),
    /Stale sync lease/,
  );
  // Composite FK independently rejects a job that mixes a campaign and another account.
  const other = await db.query<{ id: string }>("SELECT id FROM ad_accounts WHERE id<>$1 LIMIT 1", [
    account.rows[0].id,
  ]);
  await assert.rejects(
    db.query("INSERT INTO ad_sync_jobs(campaign_id,ad_account_id,status) VALUES($1,$2,'error')", [
      campaigns[0],
      other.rows[0].id,
    ]),
    /ad_sync_jobs_campaign_account_fkey/,
  );
});

test("RPC autenticada reconstrói source_url legado sem tokens nem PII", async () => {
  await as(ADMIN);
  const privateUrl =
    "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=111&selected_campaign_ids=222&access_token=synthetic-private-access-token&appsecret_proof=synthetic-private-proof&email=private-source@example.test";
  const legacy = await db.query<{ id: string }>(
    "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,platform,external_campaign_id,external_account_id,source_url,referencia_url) VALUES($1,'cordial','Legacy URL','Facebook','Leads','2026-10-01','2026-10-31','meta','222','act_111',$2,'https://example.test/manual-reference?ref=original') RETURNING id",
    [ADMIN, privateUrl],
  );
  for (const uid of [ADMIN, SECRETARY]) {
    await as(uid);
    await db.exec("SET ROLE authenticated");
    try {
      const result = await db.query<{
        value: { items: Array<{ source_url: string; referencia_url: string }> };
      }>("SELECT marketing_campaigns_safe(p_campaign_id=>$1) value", [legacy.rows[0].id]);
      const json = JSON.stringify(result.rows);
      assert.doesNotMatch(
        json,
        /synthetic-private|access_token|appsecret_proof|private-source@example/,
      );
      assert.equal(
        result.rows[0].value.items[0].source_url,
        "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=111&selected_campaign_ids=222",
      );
      assert.equal(
        result.rows[0].value.items[0].referencia_url,
        "https://example.test/manual-reference?ref=original",
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  await db.query("UPDATE marketing_campaigns SET external_account_id=NULL WHERE id=$1", [
    legacy.rows[0].id,
  ]);
  await as(ADMIN);
  const unverifiable = await db.query<{ value: { items: Array<{ source_url: null }> } }>(
    "SELECT marketing_campaigns_safe(p_campaign_id=>$1) value",
    [legacy.rows[0].id],
  );
  assert.equal(unverifiable.rows[0].value.items[0].source_url, null);
});

test("owned_only estreita linhas e resumo para o usuário autenticado sem ampliar agência", async () => {
  await as(ADMIN);
  const own = await db.query<{ id: string }>(
    "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim) VALUES($1,'cordial','Secretaria própria','Instagram','Leads','2026-10-01','2026-10-31') RETURNING id",
    [SECRETARY],
  );
  await db.query(
    "INSERT INTO marketing_daily_metrics(campaign_id,user_id,data,leads,clicks) VALUES($1,$2,'2026-10-12',7,14)",
    [own.rows[0].id, SECRETARY],
  );
  await db.query(
    "INSERT INTO marketing_daily_metrics(campaign_id,user_id,data,leads,clicks) VALUES($1,$2,'2026-10-13',100,200)",
    [own.rows[0].id, ADMIN],
  );
  await as(SECRETARY);
  await db.exec("SET ROLE authenticated");
  try {
    const narrow = await db.query<{
      r: {
        items: Array<{ id: string; user_id: string }>;
        total: number;
        summary: { current: { leads: number; spend: null } };
      };
    }>(
      "SELECT marketing_campaigns_safe(p_since=>'2026-10-01',p_until=>'2026-10-31',p_owned_only=>true) r",
    );
    assert.equal(narrow.rows[0].r.total, 1);
    assert.equal(narrow.rows[0].r.items[0].id, own.rows[0].id);
    assert.equal(narrow.rows[0].r.items[0].user_id, SECRETARY);
    assert.equal(narrow.rows[0].r.summary.current.leads, 7);
    assert.equal(narrow.rows[0].r.summary.current.spend, null);
    const normal = await db.query<{
      r: { total: number; summary: { current: { leads: number } } };
    }>("SELECT marketing_campaigns_safe(p_since=>'2026-10-01',p_until=>'2026-10-31') r");
    assert.ok(normal.rows[0].r.total > narrow.rows[0].r.total);
    assert.ok(normal.rows[0].r.summary.current.leads > 7);
    const otherBrand = await db.query<{ r: { total: number } }>(
      "SELECT marketing_campaigns_safe(p_imobiliaria=>'morar',p_owned_only=>true) r",
    );
    assert.equal(otherBrand.rows[0].r.total, 0);
  } finally {
    await db.exec("RESET ROLE");
  }
  await as(ADMIN);
  await db.exec("SET ROLE authenticated");
  try {
    const narrowedAdmin = await db.query<{ r: { items: Array<{ user_id: string }> } }>(
      "SELECT marketing_campaigns_safe(p_owned_only=>true) r",
    );
    assert.ok(narrowedAdmin.rows[0].r.items.every((row) => row.user_id === ADMIN));
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("identidade app/Página/form tem unicidade atômica entre conexões", async () => {
  await as(ADMIN);
  const cordial = await connection("497", "697", "cordial");
  const morar = await connection("497", "698", "morar");
  const results = await Promise.allSettled(
    [cordial, morar].map((id, index) =>
      db.query(
        "INSERT INTO meta_lead_form_mappings(connection_id,app_id,page_id,form_id,imobiliaria,created_by,finalidade,tipo_imovel) VALUES($1,'forged-app','497','777',$2,$3,'compra','casa')",
        [id, index === 0 ? "cordial" : "morar", ADMIN],
      ),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(failed.reason), /meta_lead_form_identity_uidx/);
  const mapping = await db.query<{
    id: string;
    app_id: string;
    connection_id: string;
    imobiliaria: string;
  }>(
    "SELECT id,app_id,connection_id,imobiliaria FROM meta_lead_form_mappings WHERE page_id='497' AND form_id='777' AND enabled",
  );
  assert.equal(mapping.rows.length, 1);
  assert.equal(mapping.rows[0].app_id, "123");
  // Model a corrupt legacy/imported duplicate to verify ingestion fails closed
  // independently of the unique index. Roll back the temporary fixture corruption.
  await db.exec("BEGIN");
  try {
    await db.exec("DROP INDEX meta_lead_form_identity_uidx");
    const other = mapping.rows[0].connection_id === cordial ? morar : cordial;
    const otherAgency = other === cordial ? "cordial" : "morar";
    await db.query(
      "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,created_by,finalidade,tipo_imovel) VALUES($1,'497','777',$2,$3,'compra','casa')",
      [other, otherAgency, ADMIN],
    );
    await db.query("SELECT meta_lead_ingest('123',$1::jsonb)", [
      JSON.stringify([{ page_id: "497", form_id: "777", leadgen_id: "9777" }]),
    ]);
    const lead = await db.query<{ status: string; connection_id: null; imobiliaria: null }>(
      "SELECT status,connection_id,imobiliaria FROM meta_lead_submissions WHERE leadgen_id='9777'",
    );
    assert.equal(lead.rows[0].status, "quarantined");
    assert.equal(lead.rows[0].connection_id, null);
    assert.equal(lead.rows[0].imobiliaria, null);
  } finally {
    await db.exec("ROLLBACK");
  }
});
test("alterar app ou Página invalida mappings e submissão antiga não usa nova identidade", async () => {
  const conn = await connection("496", "696");
  await mapped(conn, "496", "778");
  const oldLead = await ingest("496", "9778", "778");
  const batch = await claim();
  assert.ok(batch.rows.some((row) => row.id === oldLead));
  await db.query("UPDATE ad_platform_connections SET app_id='124' WHERE id=$1", [conn]);
  const oldMapping = await db.query<{ app_id: string; page_id: string; enabled: boolean }>(
    "SELECT app_id,page_id,enabled FROM meta_lead_form_mappings WHERE connection_id=$1",
    [conn],
  );
  assert.equal(oldMapping.rows[0].app_id, "123");
  assert.equal(oldMapping.rows[0].enabled, false);
  const result = await db.query<{ r: string }>("SELECT meta_lead_complete($1,$2,$3::jsonb) r", [
    oldLead,
    batch.worker,
    fields("+5511999990778"),
  ]);
  assert.equal(result.rows[0].r, "review");
  await db.query("SELECT meta_lead_ingest('123',$1::jsonb)", [
    JSON.stringify([{ page_id: "496", form_id: "778", leadgen_id: "9779" }]),
  ]);
  const unknown = await db.query<{ status: string }>(
    "SELECT status FROM meta_lead_submissions WHERE leadgen_id='9779'",
  );
  assert.equal(unknown.rows[0].status, "quarantined");
  // An explicit validated save may re-enable the form under its current app.
  await db.query(
    "UPDATE meta_lead_form_mappings SET enabled=true,app_id='forged' WHERE connection_id=$1",
    [conn],
  );
  const rebound = await db.query<{ app_id: string; enabled: boolean }>(
    "SELECT app_id,enabled FROM meta_lead_form_mappings WHERE connection_id=$1",
    [conn],
  );
  assert.equal(rebound.rows[0].app_id, "124");
  assert.equal(rebound.rows[0].enabled, true);
  await db.query("UPDATE ad_platform_connections SET page_id='498' WHERE id=$1", [conn]);
  const moved = await db.query<{ page_id: string; enabled: boolean }>(
    "SELECT page_id,enabled FROM meta_lead_form_mappings WHERE connection_id=$1",
    [conn],
  );
  assert.equal(moved.rows[0].page_id, "496");
  assert.equal(moved.rows[0].enabled, false);
  await assert.rejects(
    db.query("UPDATE meta_lead_form_mappings SET enabled=true WHERE connection_id=$1", [conn]),
    /Mapping connection scope mismatch/,
  );
});
test("conexão legada sem app validado não aceita mapeamento ativo", async () => {
  const conn = await connection("499", "699");
  await db.query("UPDATE ad_platform_connections SET app_id=NULL WHERE id=$1", [conn]);
  await assert.rejects(
    db.query(
      "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,created_by) VALUES($1,'499','779','cordial',$2)",
      [conn, ADMIN],
    ),
    /Mapping connection scope mismatch/,
  );
});

test("excluir cliente convertido depois do lead apaga PII Meta mesmo sem client_id direto", async () => {
  await as(ADMIN);
  const conn = await connection("494", "694");
  await mapped(conn, "494");
  const lead = await ingest("494", "9881");
  const batch = await claim();
  await db.query("SELECT meta_lead_complete($1,$2,$3::jsonb)", [
    lead,
    batch.worker,
    JSON.stringify({
      full_name: "Converted Test",
      phone: "+5511999990881",
      email: "convert-private@example.test",
      field_data: [{ name: "custom_interest", values: ["Synthetic private answer"] }],
    }),
  ]);
  const linked = await db.query<{ attendance_id: string; client_id: null }>(
    "SELECT attendance_id,client_id FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.ok(linked.rows[0].attendance_id);
  assert.equal(linked.rows[0].client_id, null);
  const client = await db.query<{ id: string }>(
    "INSERT INTO clients(created_by,brand,full_name,phone,email) VALUES($1,'cordial','Converted Test','+5511999990881','convert-private@example.test') RETURNING id",
    [ADMIN],
  );
  // Matches convertAtendimento: it sets cliente_convertido_id, not cliente_id.
  await db.query(
    "UPDATE attendances SET convertido_em_cliente=true,cliente_convertido_id=$2 WHERE id=$1",
    [linked.rows[0].attendance_id, client.rows[0].id],
  );
  await db.query("DELETE FROM clients WHERE id=$1", [client.rows[0].id]);
  const erased = await db.query<{
    full_name: null;
    phone: null;
    email: null;
    field_data: null;
    privacy_deleted_at: string;
    attendance_id: string;
    leadgen_id: string;
  }>(
    "SELECT full_name,phone,email,field_data,privacy_deleted_at,attendance_id,leadgen_id FROM meta_lead_submissions WHERE id=$1",
    [lead],
  );
  assert.equal(erased.rows[0].full_name, null);
  assert.equal(erased.rows[0].phone, null);
  assert.equal(erased.rows[0].email, null);
  assert.equal(erased.rows[0].field_data, null);
  assert.ok(erased.rows[0].privacy_deleted_at);
  assert.equal(erased.rows[0].attendance_id, linked.rows[0].attendance_id);
  assert.equal(erased.rows[0].leadgen_id, "9881");
});
