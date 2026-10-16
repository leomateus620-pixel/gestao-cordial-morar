import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
test("proactive database: RLS, grant rotation, run claims, notification idempotency and pause", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${a}'),('${b}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$; CREATE FUNCTION public.assistant_current_scope() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'corretor:cordial'::text $$; CREATE TABLE public.notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,tipo text,category text,titulo text,mensagem text,link text,lida boolean,dedup_key text,entity_type text,entity_id uuid); CREATE UNIQUE INDEX notification_dedup ON public.notifications(dedup_key) WHERE dedup_key IS NOT NULL; CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),secret text,name text,description text); CREATE VIEW vault.decrypted_secrets AS SELECT id,secret AS decrypted_secret,name FROM vault.secrets; CREATE FUNCTION vault.create_secret(value text,name text DEFAULT NULL,description text DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(secret,name,description) VALUES(value,name,description) RETURNING id $$; CREATE FUNCTION vault.update_secret(sid uuid,value text,name text DEFAULT NULL,description text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret=value WHERE id=sid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT ALL ON public.notifications TO service_role;`,
    );
    await db.exec(
      await readFile(
        new URL("../../../drizzle/migrations/0016_assistant_proactive.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../../drizzle/migrations/0018_assistant_routine_revision_claim.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const assume = async (user: string) =>
      db.exec(
        `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`,
      );
    await assume(a);
    await db.exec(
      `INSERT INTO assistant_memory(user_id,preferences) VALUES('${a}','{"tone":"curto","focusNeighborhoods":[],"preferredStart":"08:00","preferredEnd":"18:00"}'); INSERT INTO assistant_routines(id,user_id,name,template,hour,minute,next_run_at) VALUES('${a}','${a}','Seu dia','daily_briefing',0,0,now()-interval '1 minute');`,
    );
    await assert.rejects(
      () =>
        db.exec(
          `UPDATE assistant_memory SET preferences='${JSON.stringify({ tone: "curto", focusNeighborhoods: [], preferredStart: "08:00", preferredEnd: "18:00", owner: "PRIVATE" })}' WHERE user_id='${a}'`,
        ),
      /check constraint/,
    );
    await assume(b);
    assert.equal((await db.query("SELECT * FROM assistant_memory")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM assistant_routines")).rows.length, 0);
    await assert.rejects(
      () => db.exec(`INSERT INTO assistant_memory(user_id,preferences) VALUES('${a}','{}')`),
      /row-level security|duplicate key/,
    );
    await assert.rejects(
      () => db.exec(`SELECT * FROM assistant_oauth_states`),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec(`SELECT secret_id FROM assistant_delegations`),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec(`SELECT assistant_delegation_acquire('${a}','${a}')`),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.exec(
          `INSERT INTO assistant_routine_runs(routine_id,user_id,local_day,scheduled_at) VALUES('${a}','${a}',CURRENT_DATE,now())`,
        ),
      /permission denied/,
    );
    await db.exec("RESET ROLE; SET ROLE service_role;");
    await db.query(`SELECT assistant_delegation_put('${a}','client','refresh-original')`);
    const first = await db.query(`SELECT * FROM assistant_delegation_acquire('${a}','${a}')`);
    assert.equal((first.rows[0] as any).refresh_token, "refresh-original");
    assert.equal(
      (await db.query<any>(`SELECT * FROM assistant_delegation_acquire('${a}','${b}')`)).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          `SELECT assistant_delegation_rotate('${a}','${b}','bad') AS ok`,
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          `SELECT assistant_delegation_rotate('${a}','${a}','refresh-rotated') AS ok`,
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query<any>(`SELECT * FROM assistant_delegation_acquire('${a}','${b}')`)).rows[0]
        .refresh_token,
      "refresh-rotated",
    );
    const claims = await db.query<any>("SELECT * FROM assistant_routine_claim(1)");
    assert.equal(claims.rows.length, 1);
    const run = claims.rows[0];
    assert.equal((await db.query("SELECT * FROM assistant_routine_claim(1)")).rows.length, 0);
    const params = [
      run.id,
      run.lease_id,
      "corretor:cordial",
      JSON.stringify([{ tool: "agenda_today", template: "daily_briefing", params: {} }]),
      new Date(Date.now() + 86400000).toISOString(),
      JSON.stringify([{ client_id: a, property_id: b }]),
      a,
    ];
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT assistant_routine_finish($1,$2,$3,$4,$5,$6,$7) AS ok",
          params,
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT assistant_routine_finish($1,$2,$3,$4,$5,$6,$7) AS ok",
          params,
        )
      ).rows[0].ok,
      false,
    );
    assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM assistant_match_seen")).rows.length, 1);
    const notification = (await db.query<any>("SELECT * FROM notifications")).rows[0];
    assert.ok(notification.link.includes(`routine=${a}&run=${run.id}`));
    assert.ok(!JSON.stringify(notification).includes("refresh-"));

    // An expired rotation lease is uncertain, so the old refresh token is never reissued.
    await db.exec(
      `UPDATE assistant_delegations SET lease_until=now()-interval '1 second' WHERE user_id='${a}'`,
    );
    assert.equal(
      (await db.query(`SELECT * FROM assistant_delegation_acquire('${a}','${a}')`)).rows.length,
      0,
    );
    assert.equal(
      (await db.query<any>(`SELECT status FROM assistant_delegations WHERE user_id='${a}'`)).rows[0]
        .status,
      "needs_reauthorization",
    );
    // Transient failures may claim the same occurrence at most three times.
    await db.exec(
      `INSERT INTO assistant_routines(id,user_id,name,template,hour,minute,next_run_at) VALUES('${b}','${b}','Rotina B','agenda_today',0,0,now()-interval '1 minute')`,
    );
    let failedRun: any;
    for (let n = 1; n <= 3; n++) {
      const next = await db.query<any>("SELECT * FROM assistant_routine_claim(1)");
      assert.equal(next.rows.length, 1);
      failedRun = next.rows[0];
      assert.equal(failedRun.attempts, n);
      await db.query(
        "UPDATE assistant_routine_runs SET status='failed',next_attempt_at=now(),lease_until=NULL WHERE id=$1",
        [failedRun.id],
      );
    }
    assert.equal((await db.query("SELECT * FROM assistant_routine_claim(1)")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 1);
    // Pausing or editing settings invalidates a claimed revision before notification commit.
    await db.exec(`UPDATE assistant_routines SET status='paused' WHERE id='${b}'`);
    await db.query(
      "UPDATE assistant_routine_runs SET status='running',lease_id=$2,lease_until=now()+interval '1 minute' WHERE id=$1",
      [failedRun.id, b],
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT assistant_routine_finish($1,$2,$3,$4,$5,$6,$7) AS ok",
          [
            failedRun.id,
            b,
            "corretor:cordial",
            "[]",
            new Date(Date.now() + 86400000).toISOString(),
            "[]",
            null,
          ],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 1);
    // A newer confirmed schedule can reuse an unfinished occurrence, but
    // never steal an active lease or create another completed daily event.
    await db.exec(
      `UPDATE assistant_routines SET status='active',next_run_at=now()-interval '1 minute' WHERE id='${b}'`,
    );
    assert.equal((await db.query("SELECT * FROM assistant_routine_claim(1)")).rows.length, 0);
    await db.query(
      "UPDATE assistant_routine_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [failedRun.id],
    );
    const revised = await db.query<any>("SELECT * FROM assistant_routine_claim(1)");
    assert.equal(revised.rows.length, 1);
    assert.equal(revised.rows[0].id, failedRun.id);
    assert.equal(revised.rows[0].attempts, 1);
    const current = await db.query<any>("SELECT revision FROM assistant_routines WHERE id=$1", [b]);
    assert.equal(revised.rows[0].routine_revision, current.rows[0].revision);
    assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 1);
    await assume(b);
    assert.equal((await db.query("SELECT * FROM assistant_routine_runs")).rows.length, 1);
    assert.equal((await db.query<any>("SELECT * FROM assistant_routine_runs")).rows[0].user_id, b);
    await assume(a);
    assert.equal((await db.query("SELECT * FROM assistant_routine_runs")).rows.length, 1);
    await db.query("SELECT assistant_delegation_revoke()");
    assert.equal(
      (await db.query<any>("SELECT status FROM assistant_delegations")).rows[0].status,
      "revoked",
    );
    assert.equal(
      (await db.query<any>("SELECT status FROM assistant_routines")).rows[0].status,
      "needs_reauthorization",
    );
    await db.exec("RESET ROLE;");
    assert.equal((await db.query("SELECT * FROM vault.secrets")).rows.length, 0);
    // No destructive initial cron activation or published-route assumption.
    assert.equal(
      (
        await db.query<{ enabled: boolean }>(
          "SELECT assistant_routine_scheduler_status() AS enabled",
        )
      ).rows[0].enabled,
      false,
    );
  } finally {
    await db.close();
  }
});
