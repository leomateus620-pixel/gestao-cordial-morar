import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "10000000-0000-4000-8000-000000000001",
  user = "10000000-0000-4000-8000-000000000002",
  other = "10000000-0000-4000-8000-000000000003";
const action = "20000000-0000-4000-8000-000000000001",
  request = "30000000-0000-4000-8000-000000000001",
  routine = "40000000-0000-4000-8000-000000000001",
  proof = "50000000-0000-4000-8000-000000000001";
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA vault;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${admin}'),('${user}'),('${other}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE TABLE user_roles(user_id uuid,role text);CREATE TABLE user_agencies(user_id uuid,agency text);INSERT INTO user_roles VALUES('${admin}','admin'),('${user}','corretor'),('${other}','corretor');INSERT INTO user_agencies VALUES('${admin}','cordial'),('${user}','cordial'),('${other}','morar');
 CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE FUNCTION has_notification_agency_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 CREATE FUNCTION attendance_can_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 CREATE TABLE clients(id uuid,brand text,created_by uuid,assigned_broker_id uuid,full_name text);CREATE TABLE properties(id uuid,archived_at timestamptz);CREATE TABLE attendances(id uuid,imobiliaria text,corretor_id text,cliente_id uuid,cliente_nome text,imovel_id uuid,pipeline_stage text,updated_at timestamptz);
 CREATE TABLE agenda_events(id uuid);CREATE TABLE agenda_event_reminders(id uuid);
 CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,tipo text,category text,titulo text,mensagem text,link text,lida boolean,dedup_key text,entity_type text,entity_id uuid);CREATE UNIQUE INDEX notification_dedup ON notifications(dedup_key) WHERE dedup_key IS NOT NULL;
 CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),secret text,name text);CREATE VIEW vault.decrypted_secrets AS SELECT id,secret AS decrypted_secret,name FROM vault.secrets;
 CREATE FUNCTION vault.create_secret(value text) RETURNS uuid LANGUAGE sql AS $$INSERT INTO vault.secrets(secret) VALUES(value) RETURNING id$$;
 CREATE FUNCTION vault.update_secret(sid uuid,value text) RETURNS void LANGUAGE sql AS $$UPDATE vault.secrets SET secret=value WHERE id=sid$$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;GRANT SELECT ON user_roles,user_agencies,clients,properties,attendances TO authenticated;GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  for (const file of [
    "0013_assistant_foundation.sql",
    "0015_assistant_actions.sql",
    "0016_assistant_proactive.sql",
    "0018_assistant_routine_revision_claim.sql",
    "0019_assistant_bot_configuration.sql",
    "0020_assistant_routine_compatibility.sql",
  ])
    await db.exec(
      await readFile(new URL(`../../../drizzle/migrations/${file}`, import.meta.url), "utf8"),
    );
  return db;
}
async function assume(db: PGlite, id: string, claims: Record<string, string | undefined> = {}) {
  await db.exec(
    `RESET ROLE;SELECT set_config('request.jwt.claim.sub','${id}',false);SELECT set_config('request.jwt.claims','${JSON.stringify(claims)}',false);SET ROLE authenticated;`,
  );
}
async function service(db: PGlite) {
  await db.exec(
    "RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);SET ROLE service_role",
  );
}
const agenda = (id = action) => ({
  id,
  bot_id: "agenda",
  scope_key: "corretor:cordial",
  type: "agenda_event",
  payload: {
    title: "Visita Fixture",
    agency: "cordial",
    kind: "visita",
    start: "2026-11-02T10:00:00-03:00",
    end: "2026-11-02T11:00:00-03:00",
  },
  expected_state: {},
});
test(
  "published phase-3 direct writes remain compatible and generation fences prevent resurrection",
  { timeout: 30000 },
  async () => {
    const db = await setup();
    try {
      await assume(db, user);
      // Same columns and ON CONFLICT path as the already published phase-3 code.
      const oldInsert = () =>
        db.query(
          "INSERT INTO assistant_routines(id,user_id,name,template,hour,minute,days,day_of_week,status,next_run_at,updated_at) VALUES($1,$2,'Resumo Fixture','agenda_today',0,0,'every_day',NULL,'active',now()-interval '1 minute',now()) ON CONFLICT(id) DO NOTHING RETURNING id",
          [routine, user],
        );
      assert.equal((await oldInsert()).rows.length, 1);
      assert.equal((await oldInsert()).rows.length, 0);
      assert.equal(
        (
          await db.query<any>("SELECT bot_generation FROM assistant_routines WHERE id=$1", [
            routine,
          ])
        ).rows[0].bot_generation,
        1,
      );
      await db.query(
        "UPDATE assistant_routines SET name='Resumo editado',hour=0,minute=0,days='weekdays',day_of_week=NULL,status='active',next_run_at=now()-interval '1 minute',updated_at=now() WHERE id=$1 AND user_id=$2",
        [routine, user],
      );
      await db.query("UPDATE assistant_routines SET days='every_day' WHERE id=$1", [routine]);
      await assert.rejects(
        () =>
          db.query(
            "INSERT INTO assistant_routines(user_id,name,template,next_run_at) VALUES($1,'Equipe Fixture','broker_ranking',now())",
            [user],
          ),
        /row-level security/,
      );
      await assume(db, other);
      assert.equal(
        (
          await db.query("UPDATE assistant_routines SET status='active' WHERE id=$1 RETURNING id", [
            routine,
          ])
        ).rows.length,
        0,
      );
      await assume(db, user, { client_id: "client-fixture" });
      assert.equal(
        (
          await db.query("UPDATE assistant_routines SET status='active' WHERE id=$1 RETURNING id", [
            routine,
          ])
        ).rows.length,
        0,
      );
      await assert.rejects(() => oldInsert(), /row-level security/);
      await assume(db, admin);
      await db.query("SELECT assistant_bot_config_save('agenda',1,false,'',NULL,true)");
      await assume(db, user);
      await assert.rejects(
        () => db.query("UPDATE assistant_routines SET status='active' WHERE id=$1", [routine]),
        /bot_disabled/,
      );
      await assume(db, admin);
      await db.query("SELECT assistant_bot_config_save('agenda',2,true,'',NULL,true)");
      await assume(db, user);
      assert.equal(
        (
          await db.query<any>("SELECT status,bot_generation FROM assistant_routines WHERE id=$1", [
            routine,
          ])
        ).rows[0].status,
        "paused",
      );
      await db.query(
        "UPDATE assistant_routines SET status='active',next_run_at=now()-interval '1 minute',updated_at=now() WHERE id=$1 AND user_id=$2",
        [routine, user],
      );
      assert.equal(
        (
          await db.query<any>("SELECT bot_generation FROM assistant_routines WHERE id=$1", [
            routine,
          ])
        ).rows[0].bot_generation,
        3,
      );
      await service(db);
      const before = (await db.query<any>("SELECT * FROM assistant_routine_claim(1)")).rows[0];
      assert.equal(before.bot_generation, 3);
      await assume(db, admin);
      await db.query("SELECT assistant_bot_config_save('agenda',3,false,'',NULL,true)");
      await db.query("SELECT assistant_bot_config_save('agenda',4,true,'',NULL,true)");
      await service(db);
      assert.equal(
        (
          await db.query<any>(
            "SELECT assistant_routine_finish($1,$2,'corretor:cordial','[]',now()+interval '1 day') AS ok",
            [before.id, before.lease_id],
          )
        ).rows[0].ok,
        false,
      );
      assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 0);
      // Represents a committed legacy statement that read generation3 before the
      // concurrent disable/re-enable committed generation5. It can never run.
      const raced = crypto.randomUUID();
      await db.query(
        "INSERT INTO assistant_routines(id,user_id,name,template,hour,minute,next_run_at,status,bot_generation) VALUES($1,$2,'Concorrência Fixture','agenda_today',0,0,now()-interval '1 minute','active',3)",
        [raced, user],
      );
      assert.equal((await db.query("SELECT * FROM assistant_routine_claim(20)")).rows.length, 0);
      assert.equal(
        (
          await db.query<any>("SELECT status,bot_generation FROM assistant_routines WHERE id=$1", [
            raced,
          ])
        ).rows[0].status,
        "paused",
      );
      await assume(db, user);
      await db.query(
        "SELECT assistant_routine_state_configured($1,'active',now()-interval '1 minute',true)",
        [routine],
      );
      assert.equal(
        (
          await db.query<any>("SELECT bot_generation FROM assistant_routines WHERE id=$1", [
            routine,
          ])
        ).rows[0].bot_generation,
        5,
      );
      await service(db);
      await db.query(
        "UPDATE assistant_routine_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
        [before.id],
      );
      const after = (await db.query<any>("SELECT * FROM assistant_routine_claim(1)")).rows[0];
      assert.equal(after.id, before.id);
      assert.equal(after.bot_generation, 5);
      assert.equal(
        (
          await db.query<any>(
            "SELECT assistant_routine_finish($1,$2,'corretor:cordial','[]',now()+interval '1 day') AS ok",
            [after.id, after.lease_id],
          )
        ).rows[0].ok,
        true,
      );
      assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 1);
      const stamp = (
        await db.query<any>(
          "SELECT pg_get_functiondef('assistant_routine_generation_stamp()'::regprocedure) AS definition",
        )
      ).rows[0].definition;
      assert(!/\bFOR\s+(SHARE|UPDATE)\b/i.test(stamp.replace(/--[^\n]*/g, "")));
    } finally {
      await db.close();
    }
  },
);
test(
  "configuration SQL: personal admin, CAS, atomic external replay, revocation, disabled bots and routine guards",
  { timeout: 30000 },
  async () => {
    const db = await setup();
    try {
      await assume(db, user);
      assert.equal((await db.query("SELECT * FROM assistant_bot_configs")).rows.length, 7);
      await assert.rejects(
        () => db.query("SELECT assistant_bot_config_save('agenda',1,false,'',NULL,true)"),
        /personal_admin_required/,
      );
      await assert.rejects(
        () => db.query("UPDATE assistant_bot_configs SET enabled=false"),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          db.query("SELECT assistant_external_action_prepare($1,'client-fixture',1,$2,$3,$4)", [
            user,
            request,
            "a".repeat(64),
            agenda(),
          ]),
        /permission denied/,
      );
      await assume(db, admin, { client_id: "client-fixture" });
      await assert.rejects(
        () => db.query("SELECT assistant_mcp_client_set('client-fixture','Fixture',true,0,true)"),
        /personal_admin_required/,
      );
      assert.equal((await db.query("SELECT * FROM assistant_mcp_clients")).rows.length, 0);
      await assume(db, admin);
      await db.query("SELECT assistant_mcp_client_set('client-fixture','Fixture',true,0,true)");
      await assume(db, user, { client_id: "client-fixture" });
      assert.deepEqual((await db.query("SELECT * FROM assistant_mcp_client_permission()")).rows, [
        { client_id: "client-fixture", revision: 1, approved: true },
      ]);
      await service(db);
      const params = [user, "client-fixture", 1, request, "a".repeat(64), agenda()];
      const first = await db.query<any>(
        "SELECT assistant_external_action_prepare($1,$2,$3,$4,$5,$6) AS id",
        params,
      );
      assert.equal(first.rows[0].id, action);
      const expiration = (
        await db.query<any>("SELECT expires_at,revision FROM assistant_actions WHERE id=$1", [
          action,
        ])
      ).rows[0];
      const repeated = await Promise.all([
        db.query<any>("SELECT assistant_external_action_prepare($1,$2,$3,$4,$5,$6) AS id", params),
        db.query<any>("SELECT assistant_external_action_prepare($1,$2,$3,$4,$5,$6) AS id", params),
      ]);
      assert(repeated.every((r) => r.rows[0].id === action));
      assert.deepEqual(
        (await db.query("SELECT expires_at,revision FROM assistant_actions WHERE id=$1", [action]))
          .rows[0],
        expiration,
      );
      assert.equal(
        (await db.query("SELECT * FROM assistant_audit WHERE tool='prepare_external_action'")).rows
          .length,
        1,
      );
      await assert.rejects(
        () =>
          db.query("SELECT assistant_external_action_prepare($1,$2,$3,$4,$5,$6)", [
            ...params.slice(0, 4),
            "b".repeat(64),
            agenda(),
          ]),
        /external_request_conflict/,
      );
      await assume(db, other, { client_id: "client-fixture" });
      assert.equal((await db.query("SELECT id FROM assistant_actions")).rows.length, 0);
      await assume(db, user, { client_id: "client-fixture" });
      await assert.rejects(
        () => db.query("SELECT confirmation_proof FROM assistant_actions"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("SELECT assistant_action_begin($1,1,$2)", [action, proof]),
        /interactive_confirmation_required/,
      );
      await assume(db, user, { azp: "client-fixture" });
      await assert.rejects(
        () => db.query("SELECT assistant_action_begin($1,1,$2)", [action, proof]),
        /interactive_confirmation_required/,
      );
      await assume(db, admin);
      await db.query("SELECT assistant_mcp_client_set('client-fixture','Fixture',false,1,true)");
      await service(db);
      assert.equal(
        (await db.query<any>("SELECT status FROM assistant_actions WHERE id=$1", [action])).rows[0]
          .status,
        "cancelled",
      );
      await assert.rejects(
        () => db.query("SELECT assistant_external_action_prepare($1,$2,$3,$4,$5,$6)", params),
        /external_client_unavailable/,
      );
      await assume(db, admin);
      await db.query("SELECT assistant_mcp_client_set('client-fixture','Fixture',true,2,true)");
      await service(db);
      await assert.rejects(
        () =>
          db.query("SELECT assistant_external_action_prepare($1,$2,$3,$4,$5,$6)", [
            user,
            "client-fixture",
            3,
            request,
            "a".repeat(64),
            agenda(),
          ]),
        /external_request_conflict/,
      );
      await assume(db, user);
      const row = {
        name: "Resumo Fixture",
        template: "agenda_today",
        hour: 0,
        minute: 0,
        days: "every_day",
        day_of_week: null,
        status: "active",
        next_run_at: new Date(Date.now() - 60000).toISOString(),
      };
      await db.query("SELECT assistant_routine_save_configured($1,$2,true,true)", [routine, row]);
      await db.query("SELECT assistant_routine_save_configured($1,$2,true,true)", [routine, row]);
      await assume(db, admin);
      const outcomes = await Promise.allSettled([
        db.query("SELECT assistant_bot_config_save('agenda',1,false,'',NULL,true)"),
        db.query("SELECT assistant_bot_config_save('agenda',1,true,'',NULL,true)"),
      ]);
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      await assume(db, user);
      assert.equal(
        (await db.query<any>("SELECT status FROM assistant_routines WHERE id=$1", [routine]))
          .rows[0].status,
        "paused",
      );
      await assert.rejects(
        () =>
          db.query("SELECT assistant_routine_state_configured($1,'active',now(),true)", [routine]),
        /bot_disabled/,
      );
      await assert.rejects(
        () =>
          db.query("SELECT assistant_routine_save_configured($1,$2,false,true)", [routine, row]),
        /bot_disabled/,
      );
      await service(db);
      await assert.rejects(
        () =>
          db.query(
            "INSERT INTO assistant_actions(id,user_id,bot_id,scope_key,type,payload) VALUES($1,$2,'agenda','corretor:cordial','agenda_event','{}')",
            [crypto.randomUUID(), user],
          ),
        /bot_disabled/,
      );
      assert.equal((await db.query("SELECT * FROM assistant_routine_claim(20)")).rows.length, 0);
      await assume(db, admin);
      await db.query("SELECT assistant_bot_config_save('agenda',2,true,'',NULL,true)");
      await assume(db, user);
      assert.equal(
        (await db.query<any>("SELECT status FROM assistant_routines WHERE id=$1", [routine]))
          .rows[0].status,
        "paused",
      );
      await service(db);
      await assert.rejects(
        () =>
          db.query(
            "INSERT INTO assistant_actions(id,user_id,bot_id,scope_key,type,payload,origin_client_id,origin_client_revision,external_request_id,external_request_hash) VALUES($1,$2,'agenda','corretor:cordial','agenda_event','{}','client-fixture',NULL,$3,NULL)",
            [crypto.randomUUID(), user, crypto.randomUUID()],
          ),
        /external_client_unavailable|check constraint/,
      );
    } finally {
      await db.close();
    }
  },
);
test(
  "configuration SQL: per-client pending bound, expired replay, worker cancellation and missing-row failure",
  { timeout: 30000 },
  async () => {
    const db = await setup();
    try {
      await assume(db, admin);
      await db.query("SELECT assistant_mcp_client_set('client-fixture','Fixture',true,0,true)");
      await service(db);
      const pending = await Promise.allSettled(
        Array.from({ length: 26 }, () =>
          db.query("SELECT assistant_external_action_prepare($1,'client-fixture',1,$2,$3,$4)", [
            user,
            crypto.randomUUID(),
            "a".repeat(64),
            agenda(crypto.randomUUID()),
          ]),
        ),
      );
      assert.equal(pending.filter((r) => r.status === "fulfilled").length, 25);
      assert.equal(pending.filter((r) => r.status === "rejected").length, 1);
      const first = (
        await db.query<any>(
          "SELECT id,external_request_id,extract(epoch from(expires_at-created_at))::int AS seconds FROM assistant_actions ORDER BY id LIMIT 1",
        )
      ).rows[0];
      assert.equal(first.seconds, 900);
      await db.query(
        "UPDATE assistant_actions SET expires_at=now()-interval '1 minute' WHERE id=$1",
        [first.id],
      );
      const oldExpiry = (
        await db.query<any>("SELECT expires_at FROM assistant_actions WHERE id=$1", [first.id])
      ).rows[0].expires_at;
      await db.query("SELECT assistant_external_action_prepare($1,'client-fixture',1,$2,$3,$4)", [
        user,
        first.external_request_id,
        "a".repeat(64),
        agenda(first.id),
      ]);
      assert.deepEqual(
        (await db.query<any>("SELECT expires_at FROM assistant_actions WHERE id=$1", [first.id]))
          .rows[0].expires_at,
        oldExpiry,
      );
      await db.query("SELECT assistant_external_action_prepare($1,'client-fixture',1,$2,$3,$4)", [
        user,
        crypto.randomUUID(),
        "a".repeat(64),
        agenda(crypto.randomUUID()),
      ]);
      const row = {
        name: "Agenda Fixture",
        template: "agenda_today",
        hour: 0,
        minute: 0,
        days: "every_day",
        day_of_week: null,
        status: "active",
        next_run_at: new Date(Date.now() - 60000).toISOString(),
      };
      await assume(db, user);
      await db.query("SELECT assistant_routine_save_configured($1,$2,true,true)", [routine, row]);
      await service(db);
      const run = (await db.query<any>("SELECT * FROM assistant_routine_claim(1)")).rows[0];
      assert(run);
      await assume(db, admin);
      await db.query("SELECT assistant_bot_config_save('agenda',1,false,'',NULL,true)");
      await service(db);
      await assert.rejects(
        () =>
          db.query(
            "SELECT assistant_routine_finish($1,$2,'corretor:cordial','[]',now()+interval '1 day')",
            [run.id, run.lease_id],
          ),
        /bot_disabled/,
      );
      assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 0);
      await db.exec("DELETE FROM assistant_bot_configs WHERE bot_id='mercado'");
      await assume(db, user);
      await assert.rejects(
        () => db.query("SELECT assistant_bot_available('mercado')"),
        /bot_configuration_unavailable/,
      );
      await db.exec("RESET ROLE;SET ROLE anon");
      await assert.rejects(
        () => db.query("SELECT * FROM assistant_bot_configs"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("SELECT * FROM assistant_mcp_client_permission()"),
        /permission denied/,
      );
    } finally {
      await db.close();
    }
  },
);
test(
  "delegated direct SQL isolates action origins and receipts even for an administrator",
  { timeout: 30000 },
  async () => {
    const db = await setup();
    try {
      await assume(db, admin);
      for (const client of ["client-alpha", "client-bravo"])
        await db.query("SELECT assistant_mcp_client_set($1,'Fixture',true,0,true)", [client]);
      await service(db);
      const ids: { owner: string; client: string | null; id: string }[] = [];
      for (const [owner, scope, clients] of [
        [admin, "admin:cordial", [null, "client-alpha", "client-bravo"]],
        [user, "corretor:cordial", [null, "client-alpha", "client-bravo"]],
        [other, "corretor:morar", ["client-alpha"]],
      ] as const) {
        for (const client of clients) {
          const id = crypto.randomUUID();
          ids.push({ owner, client, id });
          if (client)
            await db.query("SELECT assistant_external_action_prepare($1,$2,1,$3,$4,$5)", [
              owner,
              client,
              crypto.randomUUID(),
              "a".repeat(64),
              { ...agenda(id), scope_key: scope },
            ]);
          else
            await db.query(
              "INSERT INTO assistant_actions(id,user_id,bot_id,scope_key,type,payload) VALUES($1,$2,'agenda',$3,'agenda_event',$4)",
              [id, owner, scope, agenda(id).payload],
            );
          await db.query(
            'INSERT INTO assistant_action_receipts(action_id,user_id,revision,result) VALUES($1,$2,1,\'{"text":"Fixture"}\')',
            [id, owner],
          );
        }
      }
      const visible = async () =>
        (await db.query<{ id: string }>("SELECT id FROM assistant_actions ORDER BY id")).rows
          .map((r) => r.id)
          .sort();
      const receipts = async () =>
        (
          await db.query<{ action_id: string }>(
            "SELECT action_id FROM assistant_action_receipts ORDER BY action_id",
          )
        ).rows
          .map((r) => r.action_id)
          .sort();
      await assume(db, admin);
      assert.equal((await visible()).length, 7);
      assert.equal((await receipts()).length, 3);
      await assume(db, user);
      assert.deepEqual(
        await visible(),
        ids
          .filter((r) => r.owner === user)
          .map((r) => r.id)
          .sort(),
      );
      for (const owner of [admin, user])
        for (const client of ["client-alpha", "client-bravo"]) {
          await assume(db, owner, { client_id: client });
          const expected = ids
            .filter((r) => r.owner === owner && r.client === client)
            .map((r) => r.id)
            .sort();
          assert.deepEqual(await visible(), expected);
          assert.deepEqual(await receipts(), expected);
          await assert.rejects(
            () => db.query("SELECT confirmation_proof FROM assistant_actions"),
            /permission denied/,
          );
        }
      for (const claims of [
        { azp: "client-alpha" },
        { client_id: "client-alpha", azp: "client-bravo" },
      ]) {
        await assume(db, admin, claims);
        assert.deepEqual(await visible(), []);
        assert.deepEqual(await receipts(), []);
      }
      await assume(db, admin);
      await db.query("SELECT assistant_mcp_client_set('client-alpha','Fixture',false,1,true)");
      await assume(db, admin, { client_id: "client-alpha" });
      assert.deepEqual(await visible(), []);
      assert.deepEqual(await receipts(), []);
      await assume(db, admin);
      await db.query("SELECT assistant_mcp_client_set('client-alpha','Fixture',true,2,true)");
      await assume(db, user, { client_id: "client-alpha" });
      assert.deepEqual(await visible(), []);
      assert.deepEqual(await receipts(), []);
      await assume(db, user, { client_id: "client-bravo" });
      assert.equal((await visible()).length, 1);
    } finally {
      await db.close();
    }
  },
);
