import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const u = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  att = "20000000-0000-4000-8000-000000000001",
  prop = "30000000-0000-4000-8000-000000000001";
const proof = "40000000-0000-4000-8000-000000000001";
async function setup(withAgencyCorrection = true) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE TABLE user_roles(user_id uuid,role text);CREATE TABLE user_agencies(user_id uuid,agency text);
 CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE FUNCTION has_notification_agency_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT has_role($1,'admin') OR EXISTS(SELECT 1 FROM user_agencies WHERE user_id=$1 AND (agency=$2 OR $2='ambas'))$$;
 REVOKE ALL ON FUNCTION has_notification_agency_access(uuid,text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION has_notification_agency_access(uuid,text) TO service_role;
 CREATE FUNCTION current_user_has_notification_agency_access(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT has_notification_agency_access(auth.uid(),$1)$$;
 REVOKE ALL ON FUNCTION current_user_has_notification_agency_access(text) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION current_user_has_notification_agency_access(text) TO authenticated,service_role;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE profiles(id uuid PRIMARY KEY,nome text);
 CREATE TABLE clients(id uuid PRIMARY KEY,created_by uuid,assigned_broker_id uuid,brand text,full_name text);
 CREATE TABLE properties(id uuid PRIMARY KEY,archived_at timestamptz,is_draft boolean DEFAULT false,exibir_imovel boolean DEFAULT true,disponibilidade text DEFAULT 'sim');
 CREATE TYPE pipeline_stage AS ENUM('primeiro_contato','apresentando_solucao','visita','proposta','fechamento','perdido','em_espera','arquivado');
 CREATE TABLE attendances(id uuid PRIMARY KEY,created_by uuid,corretor_id text,cliente_id uuid,cliente_nome text,imovel_id uuid,imobiliaria text,status text,pipeline_stage pipeline_stage,proximo_retorno timestamptz,proximo_passo text,motivo_perda text,updated_at timestamptz DEFAULT now());
 CREATE TABLE attendance_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attendance_id uuid,client_id uuid,event_type text,actor_id uuid,actor_name text,description text,source text);
 CREATE FUNCTION attendance_can_access(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM attendances WHERE id=$1 AND has_notification_agency_access(auth.uid(),imobiliaria) AND (created_by=auth.uid() OR corretor_id=auth.uid()::text OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'secretaria')))$$;
 ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;CREATE POLICY att_read ON attendances FOR SELECT TO authenticated USING(attendance_can_access(id));CREATE POLICY att_update ON attendances FOR UPDATE TO authenticated USING(attendance_can_access(id)) WITH CHECK(attendance_can_access(id));
 ALTER TABLE clients ENABLE ROW LEVEL SECURITY;CREATE POLICY client_read ON clients FOR SELECT TO authenticated USING(created_by=auth.uid() OR assigned_broker_id=auth.uid() OR has_role(auth.uid(),'admin'));
 CREATE TYPE agenda_tipo AS ENUM('visita','reuniao','retorno','interno','outro');CREATE TYPE agenda_imobiliaria AS ENUM('cordial','morar','ambas');
 CREATE TABLE agenda_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid,owner_user_id uuid,tipo agenda_tipo,status text,prioridade text,imobiliaria agenda_imobiliaria,titulo text,descricao text,observacoes text,inicio timestamptz,fim timestamptz,duracao_min integer,dia_inteiro boolean,repeticao text,atendimento_id text,cliente_id text,cliente_nome text,imovel_id text,responsavel_nome text,google_calendar_sync_status text);
 CREATE TABLE agenda_event_reminders(id uuid DEFAULT gen_random_uuid(),event_id uuid,tipo text,antecedencia_min integer,ativo boolean,canal_futuro boolean);
 ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;CREATE POLICY agenda_read ON agenda_events FOR SELECT TO authenticated USING(created_by=auth.uid());CREATE POLICY agenda_write ON agenda_events FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid());
 GRANT SELECT ON user_roles,user_agencies,profiles,clients,properties,attendances,agenda_events,agenda_event_reminders,attendance_history TO authenticated;
 GRANT UPDATE ON attendances TO authenticated;GRANT INSERT ON agenda_events,agenda_event_reminders TO authenticated;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 INSERT INTO auth.users VALUES('${u}'),('${other}');INSERT INTO user_roles VALUES('${u}','corretor'),('${other}','corretor');INSERT INTO user_agencies VALUES('${u}','cordial'),('${other}','morar');INSERT INTO profiles VALUES('${u}','Pessoa Fixture'),('${other}','Outra Pessoa');
 INSERT INTO properties(id) VALUES('${prop}');INSERT INTO attendances(id,created_by,corretor_id,cliente_nome,imobiliaria,status,pipeline_stage) VALUES('${att}','${u}','${u}','Cliente Fixture','cordial','novo','primeiro_contato');`);
  const note = await readFile(
    new URL(
      "../../supabase/migrations/20260724175255_2d2466cf-afb1-4f83-8fda-9ff23377fc72.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(note.slice(note.indexOf("CREATE OR REPLACE FUNCTION public.attendance_add_note")));
  for (const migration of [
    "0010_shared_selections.sql",
    "0011_shared_selections_hardening.sql",
    "0012_shared_selections_responsavel.sql",
    "0013_assistant_foundation.sql",
    "0015_assistant_actions.sql",
  ])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${migration}`, import.meta.url), "utf8"),
    );
  if (withAgencyCorrection)
    await db.exec(
      await readFile(
        new URL(
          "../../drizzle/migrations/0017_assistant_action_agency_access.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  await assume(db, u);
  return db;
}
async function assume(db: PGlite, id: string, client?: string) {
  await db.exec(
    `RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false);SELECT set_config('request.jwt.claims','${client ? JSON.stringify({ client_id: client }) : "{}"}',false);`,
  );
}
async function prepare(
  db: PGlite,
  type: string,
  payload: unknown,
  opts: { expired?: boolean; expected?: unknown } = {},
) {
  const id = crypto.randomUUID(),
    bot = type === "agenda_event" ? "agenda" : type === "shared_selection" ? "match" : "lead";
  await db.exec("RESET ROLE;SET ROLE service_role;");
  await db.query(
    `INSERT INTO assistant_actions(id,user_id,bot_id,scope_key,type,payload,expected_state,confirmation_proof,expires_at) VALUES($1,$2,$3,'corretor:cordial',$4,$5,$6,$7,now()+$8::interval)`,
    [
      id,
      u,
      bot,
      type,
      JSON.stringify(payload),
      JSON.stringify(opts.expected ?? {}),
      proof,
      opts.expired ? "-1 minute" : "15 minutes",
    ],
  );
  await assume(db, u);
  return id;
}
async function execute(db: PGlite, id: string, revision = 1, secret = proof) {
  const { rows } = await db.query<{ r: any }>(`SELECT assistant_action_execute($1,$2,$3) r`, [
    id,
    revision,
    secret,
  ]);
  return rows[0].r;
}
test("actual action transaction: confirmation, idempotency, permissions, expiry and rollback", async (t) => {
  const db = await setup();
  try {
    await t.test(
      "prepare alone writes no business data; concurrent confirmations create exactly one note and receipt",
      async () => {
        const id = await prepare(db, "attendance_note", {
          attendanceId: att,
          text: "Nota de fixture",
        });
        assert.equal((await db.query("SELECT * FROM attendance_history")).rows.length, 0);
        const results = await Promise.all([execute(db, id), execute(db, id)]);
        assert(results.every((r) => r.status === "executed"));
        assert.equal((await db.query("SELECT * FROM attendance_history")).rows.length, 1);
        assert.equal((await db.query("SELECT * FROM assistant_action_receipts")).rows.length, 1);
      },
    );
    await t.test(
      "browser cannot forge proofs, metadata, audit or call execute without private server proof",
      async () => {
        const id = await prepare(db, "attendance_note", {
          attendanceId: att,
          text: "Sem confirmar",
        });
        await assert.rejects(() => execute(db, id, 1, crypto.randomUUID()), /action_unavailable/);
        await assert.rejects(
          () => db.exec("SELECT confirmation_proof FROM assistant_actions"),
          /permission denied/,
        );
        await assert.rejects(
          () => db.exec(`UPDATE assistant_actions SET status='confirmed' WHERE id='${id}'`),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            db.exec(
              `INSERT INTO assistant_action_receipts(action_id,user_id,revision,result) VALUES('${id}','${u}',1,'{}')`,
            ),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            db.query("SELECT assistant_action_authorize($1,$2,'corretor:cordial',1,$3)", [
              id,
              u,
              proof,
            ]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "another user, delegated OAuth client, expired proposal and old revision cannot execute",
      async () => {
        const id = await prepare(db, "attendance_note", { attendanceId: att, text: "Segura" });
        await assume(db, other);
        await assert.rejects(() => execute(db, id), /action_unavailable/);
        await assume(db, u, "external-assistant");
        await assert.rejects(() => execute(db, id), /interactive_confirmation_required/);
        await assume(db, u);
        await assert.rejects(() => execute(db, id, 9), /stale_revision/);
        const expired = await prepare(
          db,
          "attendance_note",
          { attendanceId: att, text: "Expirada" },
          { expired: true },
        );
        await assert.rejects(() => execute(db, expired), /action_expired/);
      },
    );
    await t.test(
      "linked visit creates internal event/reminders and all attendance effects once",
      async () => {
        const id = await prepare(db, "agenda_event", {
          title: "Visita Fixture",
          kind: "visita",
          agency: "cordial",
          start: "2026-11-02T13:00:00Z",
          end: "2026-11-02T14:00:00Z",
          attendanceId: att,
        });
        const first = await execute(db, id);
        assert.equal(first.status, "executed", first.error_code);
        assert.equal((await execute(db, id)).result.recordId, first.result.recordId);
        assert.equal((await db.query("SELECT * FROM agenda_events")).rows.length, 1);
        assert.equal((await db.query("SELECT * FROM agenda_event_reminders")).rows.length, 3);
        const { rows } = await db.query<{
          status: string;
          pipeline_stage: string;
          proximo_passo: string;
        }>("SELECT status,pipeline_stage,proximo_passo FROM attendances");
        assert.deepEqual(rows[0], {
          status: "visita_agendada",
          pipeline_stage: "visita",
          proximo_passo: "agendar_visita",
        });
      },
    );
    await t.test("stage proposal detects a changed target and rolls back all effects", async () => {
      const id = await prepare(
        db,
        "attendance_stage_change",
        { attendanceId: att, to: "proposta" },
        { expected: { pipelineStage: "primeiro_contato" } },
      );
      const result = await execute(db, id);
      assert.equal(result.status, "failed");
      assert.equal(result.error_code, "stale_target");
      assert.equal(
        (await db.query<{ pipeline_stage: string }>("SELECT pipeline_stage FROM attendances"))
          .rows[0].pipeline_stage,
        "visita",
      );
      assert.equal(
        (await db.query("SELECT * FROM assistant_action_receipts WHERE action_id=$1", [id])).rows
          .length,
        0,
      );
    });
    await t.test("selection reuses the canonical RPC and action ID request key", async () => {
      const id = await prepare(db, "shared_selection", {
        title: "Seleção Fixture",
        agency: "cordial",
        propertyIds: [prop],
        publicMessage: "Opções",
        expiresDays: 30,
      });
      const result = await execute(db, id);
      assert.equal(result.status, "executed", result.error_code);
      await execute(db, id);
      const { rows } = await db.query<{ client_request_id: string }>(
        "SELECT client_request_id FROM shared_selections",
      );
      assert.deepEqual(
        rows.map((r) => r.client_request_id),
        [id],
      );
    });
    await t.test("draft is copy-only and has no business table write", async () => {
      const before = (await db.query("SELECT * FROM attendance_history")).rows.length;
      const id = await prepare(db, "message_draft", {
        attendanceId: att,
        text: "Olá, podemos conversar?",
      });
      const result = await execute(db, id);
      assert.equal(result.status, "executed");
      assert.equal(result.result.draft, "Olá, podemos conversar?");
      assert.equal((await db.query("SELECT * FROM attendance_history")).rows.length, before);
    });
    await t.test(
      "failure writing the operation receipt rolls back the business effect and claim together",
      async () => {
        const id = await prepare(db, "attendance_note", {
          attendanceId: att,
          text: "Rollback fixture",
        });
        const before = (await db.query("SELECT * FROM attendance_history")).rows.length;
        await db.exec(
          `RESET ROLE;CREATE FUNCTION test_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture_receipt_failure';END$$;CREATE TRIGGER test_receipt_failure BEFORE INSERT ON assistant_action_receipts FOR EACH ROW EXECUTE FUNCTION test_reject_receipt();`,
        );
        await assume(db, u);
        await assert.rejects(() => execute(db, id), /fixture_receipt_failure/);
        assert.equal((await db.query("SELECT * FROM attendance_history")).rows.length, before);
        assert.equal(
          (
            await db.query<{ status: string }>("SELECT status FROM assistant_actions WHERE id=$1", [
              id,
            ])
          ).rows[0].status,
          "pending",
        );
        await db.exec("RESET ROLE;DROP TRIGGER test_receipt_failure ON assistant_action_receipts;");
        await assume(db, u);
      },
    );
    await t.test(
      "business RLS cannot be bypassed by a matching role/agency fingerprint",
      async () => {
        const id = await prepare(db, "agenda_event", {
          title: "Blocked by RLS",
          kind: "interno",
          agency: "cordial",
          start: "2026-11-02T13:00:00Z",
          end: "2026-11-02T14:00:00Z",
        });
        await db.exec("RESET ROLE;DROP POLICY agenda_write ON agenda_events;");
        await assume(db, u);
        const result = await execute(db, id);
        assert.equal(result.status, "failed");
        assert.equal(result.error_code, "execution_failed");
        assert.equal(
          (await db.query("SELECT * FROM agenda_events WHERE titulo='Blocked by RLS'")).rows.length,
          0,
        );
        await db.exec(
          "RESET ROLE;CREATE POLICY agenda_write ON agenda_events FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid());",
        );
        await assume(db, u);
      },
    );
    await t.test(
      "reassignment hides payload and prevents confirmation even with previously valid proof",
      async () => {
        const id = await prepare(db, "attendance_note", {
          attendanceId: att,
          text: "Nunca revelar após transferência",
        });
        await db.exec(
          `RESET ROLE;UPDATE attendances SET created_by='${other}',corretor_id='${other}',imobiliaria='morar' WHERE id='${att}';`,
        );
        await assume(db, u);
        assert.equal(
          (await db.query("SELECT payload FROM assistant_actions WHERE id=$1", [id])).rows.length,
          0,
        );
        await assert.rejects(() => execute(db, id), /action_unavailable/);
        await db.exec(
          `RESET ROLE;UPDATE attendances SET created_by='${u}',corretor_id='${u}',imobiliaria='cordial' WHERE id='${att}';`,
        );
        await assume(db, u);
      },
    );
    await t.test(
      "edit increments revision, old confirmation is rejected; cancellation writes no effect",
      async () => {
        const id = await prepare(db, "attendance_note", { attendanceId: att, text: "Original" });
        const edit = await db.query<{ r: any }>(
          "SELECT assistant_action_mutate($1,1,'edit',$2,'{}',$3) r",
          [id, JSON.stringify({ attendanceId: att, text: "Editada" }), proof],
        );
        assert.equal(edit.rows[0].r.revision, 2);
        await assert.rejects(() => execute(db, id, 1), /action_unavailable/);
        await db.exec("RESET ROLE;SET ROLE service_role;");
        const auth = await db.query<{ p: string }>(
          "SELECT assistant_action_authorize($1,$2,'corretor:cordial',2,$3) p",
          [id, u, proof],
        );
        await assume(db, u);
        await assert.rejects(() => execute(db, id, 1, auth.rows[0].p), /stale_revision/);
        const cancel = await db.query<{ r: any }>(
          "SELECT assistant_action_mutate($1,2,'cancel',NULL,NULL,$2) r",
          [id, auth.rows[0].p],
        );
        assert.equal(cancel.rows[0].r.status, "cancelled");
        await assert.rejects(() => execute(db, id, 2), /action_unavailable/);
      },
    );
    await t.test(
      "concurrent server authorization returns one proof for the same proposal revision",
      async () => {
        const id = await prepare(db, "attendance_note", {
          attendanceId: att,
          text: "Concurrent authorization",
        });
        await db.exec(
          "RESET ROLE;UPDATE assistant_actions SET confirmation_proof=NULL WHERE id='" +
            id +
            "';SET ROLE service_role;",
        );
        const authorizations = await Promise.all(
          [crypto.randomUUID(), crypto.randomUUID()].map((nonce) =>
            db.query<{ p: string }>(
              "SELECT assistant_action_authorize($1,$2,'corretor:cordial',1,$3) p",
              [id, u, nonce],
            ),
          ),
        );
        assert.equal(authorizations[0].rows[0].p, authorizations[1].rows[0].p);
        await assume(db, u);
        const confirmations = await Promise.all(
          authorizations.map((a) => execute(db, id, 1, a.rows[0].p)),
        );
        assert(confirmations.every((r) => r.status === "executed"));
      },
    );
  } finally {
    await db.close();
  }
});
test("only assistant bookkeeping helpers use SECURITY DEFINER", async () => {
  const sql = await readFile(
    new URL("../../drizzle/migrations/0015_assistant_actions.sql", import.meta.url),
    "utf8",
  );
  for (const match of sql.matchAll(/CREATE FUNCTION public\.([a-z_]+)\([\s\S]*?\$\$;/g))
    if (/SECURITY DEFINER/.test(match[0]))
      assert(
        !/\b(?:FROM|INTO|UPDATE|JOIN)\s+public\.(?:attendances|clients|properties|agenda_events|attendance_history)\b/i.test(
          match[0],
        ),
        match[1],
      );
  for (const name of [
    "assistant_action_target_access",
    "assistant_action_execute",
    "agenda_create_assistant_event",
  ])
    assert(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?SECURITY INVOKER`).test(sql));
});

test("agency access keeps the privileged helper private while authenticated action checks use its supported wrapper", async () => {
  const db = await setup(false);
  try {
    await assert.rejects(
      () => db.query("SELECT has_notification_agency_access($1,'cordial')", [u]),
      /permission denied/,
    );
    const payload = JSON.stringify({ agency: "cordial" });
    assert.equal(
      (
        await db.query<any>(
          "SELECT assistant_action_target_access('agenda_event',$1::jsonb) AS allowed",
          [payload],
        )
      ).rows[0].allowed,
      false,
    );
    await db.exec("RESET ROLE;");
    await db.exec(
      await readFile(
        new URL(
          "../../drizzle/migrations/0017_assistant_action_agency_access.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await assume(db, u);
    assert.equal(
      (
        await db.query<any>(
          "SELECT assistant_action_target_access('agenda_event',$1::jsonb) AS allowed",
          [payload],
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT assistant_action_target_access('agenda_event','{\"agency\":\"morar\"}'::jsonb) AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      () => db.query("SELECT has_notification_agency_access($1,'cordial')", [u]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
