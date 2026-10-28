import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import {
  createAuthorizationFixture,
  admin,
  broker,
  reviewer,
  mixed,
  secretary,
} from "./authorization-fixture";
let db: PGlite;
let connection: string;
let otherConnection: string;
before(async () => {
  db = await createAuthorizationFixture();
  for (const migration of ["0048_meta_ad_commands", "0053_meta_lead_synthetic_isolation"])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${migration}.sql`, import.meta.url), "utf8"),
    );
  await db.exec("ALTER TABLE profiles ADD COLUMN is_internal boolean NOT NULL DEFAULT false");
  await db.query("UPDATE profiles SET is_internal=true WHERE id=$1", [admin]);
  connection = (
    await db.query<{ id: string }>(
      "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,app_id,page_id,external_account_id) VALUES($1,'meta','cordial','system_user','123','456','555') RETURNING id",
      [admin],
    )
  ).rows[0].id;
  otherConnection = (
    await db.query<{ id: string }>(
      "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,app_id,page_id,external_account_id) VALUES($1,'meta','morar','system_user','123','456','556') RETURNING id",
      [admin],
    )
  ).rows[0].id;
});
after(async () => db?.close());
const fields = (id: string) =>
  JSON.stringify({
    full_name: "TESTE SINTÉTICO Cordial",
    email: `meta-test-${id}@example.invalid`,
    phone: null,
    field_data: [{ name: "quando_comprar", values: ["TESTE SINTÉTICO — sem intenção real"] }],
  });
async function authorize(
  lead: string,
  form = "111",
  actor = admin,
  target = admin,
  conn = connection,
) {
  return db.query<{ id: string }>(
    "SELECT meta_lead_test_authorize($1,$2,$3,$4,$5,'compra','outro','{}',now(),now()+interval '1 hour') id",
    [actor, conn, lead, form, target],
  );
}
async function ingest(lead: string, form = "111") {
  await db.query("SELECT meta_lead_ingest('123',$1)", [
    JSON.stringify([{ page_id: "456", form_id: form, leadgen_id: lead }]),
  ]);
  return (
    await db.query<{ id: string }>("SELECT id FROM meta_lead_submissions WHERE leadgen_id=$1", [
      lead,
    ])
  ).rows[0].id;
}
async function process(id: string, payload: string) {
  const worker = randomUUID();
  // Use the real claim RPC. Other test rows are terminal or intentionally quarantined.
  await db.exec("SET ROLE service_role");
  try {
    await db.query("SELECT meta_lead_claim($1,10)", [worker]);
    const result = await db.query<{ status: string }>(
      "SELECT meta_lead_complete($1,$2,$3) status",
      [id, worker, payload],
    );
    return { status: result.rows[0].status, worker };
  } finally {
    await db.exec("RESET ROLE");
  }
}
async function asAuthenticated(id: string, action: () => Promise<unknown>) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
  try {
    await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
test("only exact authorized test routes to the named internal administrator; other lead same form remains quarantined", async () => {
  await authorize("1001");
  const synthetic = await ingest("1001");
  const real = await ingest("1002");
  const rows = await db.query<{ id: string; status: string; imobiliaria: string | null }>(
    "SELECT id,status,imobiliaria FROM meta_lead_submissions WHERE id=ANY($1::uuid[])",
    [[synthetic, real]],
  );
  assert.equal(rows.rows.find((r) => r.id === synthetic)?.imobiliaria, "cordial");
  assert.equal(rows.rows.find((r) => r.id === real)?.status, "quarantined");
  const { status, worker } = await process(synthetic, fields("1001"));
  assert.equal(status, "imported");
  const proof = (
    await db.query<{
      client_id: string;
      attendance_id: string;
      broker_id: string;
      is_synthetic: boolean;
    }>(
      "SELECT client_id,attendance_id,broker_id,is_synthetic FROM meta_lead_submissions WHERE id=$1",
      [synthetic],
    )
  ).rows[0];
  assert.ok(proof.client_id);
  assert.ok(proof.attendance_id);
  assert.equal(proof.broker_id, admin);
  assert.equal(proof.is_synthetic, true);
  const client = (
    await db.query<{ brand: string; assigned_broker_id: string; phone: string; email: string }>(
      "SELECT brand,assigned_broker_id,phone,email FROM clients WHERE id=$1",
      [proof.client_id],
    )
  ).rows[0];
  assert.deepEqual(client, {
    brand: "cordial",
    assigned_broker_id: admin,
    phone: "",
    email: "meta-test-1001@example.invalid",
  });
  await ingest("1001");
  const duplicate = (
    await db.query<{ count: number; attendance_id: string }>(
      "SELECT count(*)::integer count,max(attendance_id::text) attendance_id FROM meta_lead_submissions WHERE leadgen_id='1001'",
    )
  ).rows[0];
  assert.equal(duplicate.count, 1);
  assert.equal(duplicate.attendance_id, proof.attendance_id);
  await assert.rejects(
    () => db.query("SELECT meta_lead_complete($1,$2,$3)", [synthetic, worker, fields("1001")]),
    /Stale lead lease/,
  );
  await assert.rejects(
    () => db.query("SELECT meta_lead_retry($1)", [synthetic]),
    /cannot be retried/,
  );
  assert.equal(
    (await db.query("SELECT id FROM attendances WHERE email='meta-test-1001@example.invalid'")).rows
      .length,
    1,
  );
  assert.equal((await db.query("SELECT id FROM meta_lead_form_mappings")).rows.length, 0);
});
test("webhook preceding exact authorization stays inert, and controlled retry uses only that identity", async () => {
  const id = await ingest("1010");
  assert.equal(
    (
      await db.query<{ status: string }>("SELECT status FROM meta_lead_submissions WHERE id=$1", [
        id,
      ])
    ).rows[0].status,
    "quarantined",
  );
  await authorize("1010");
  await db.query("SELECT meta_lead_retry($1)", [id]);
  assert.equal((await process(id, fields("1010"))).status, "imported");
  assert.equal(
    (
      await db.query(
        "SELECT * FROM meta_lead_submissions WHERE leadgen_id='1002' AND attendance_id IS NOT NULL",
      )
    ).rows.length,
    0,
  );
});
test("expired and disabled exact authorizations cannot fall through to later real mappings", async () => {
  for (const [lead, form, change] of [
    ["1020", "112", "expires_at=now()-interval '1 second',verified_at=now()-interval '2 seconds'"],
    ["1021", "113", "enabled=false"],
  ]) {
    await authorize(lead, form);
    await db.query(`UPDATE meta_lead_test_authorizations SET ${change} WHERE leadgen_id=$1`, [
      lead,
    ]);
    await db.query(
      "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,finalidade,tipo_imovel,broker_id,created_by) VALUES($1,'456',$2,'cordial','compra','outro',$3,$4)",
      [connection, form, broker, admin],
    );
    const effective = await db.query(
      "SELECT * FROM meta_lead_effective_mapping($1,'123','456',$2,$3)",
      [connection, form, lead],
    );
    assert.equal(effective.rows.length, 0);
    assert.equal(
      (
        await db.query("SELECT * FROM meta_lead_effective_mapping($1,'123','456',$2,'999999')", [
          connection,
          form,
        ])
      ).rows.length,
      1,
    );
  }
});
test("reviewer dominance, agency/assignee context and authenticated service boundary are enforced", async () => {
  for (const actor of [reviewer, mixed, secretary])
    await assert.rejects(() => authorize("1030", "114", actor), /outside agency/);
  for (const target of [reviewer, mixed])
    await assert.rejects(() => authorize("1031", "114", admin, target), /assignee/);
  await assert.rejects(
    () => authorize("1032", "114", admin, admin, otherConnection),
    /outside agency/,
  );
  await db.query("INSERT INTO user_agencies VALUES($1,'cordial') ON CONFLICT DO NOTHING", [mixed]);
  await assert.rejects(() => authorize("1033", "114", mixed, admin), /outside agency/);
  for (const id of [admin, reviewer, mixed, secretary])
    await asAuthenticated(id, async () => {
      await assert.rejects(
        () => db.query("SELECT * FROM meta_lead_test_authorizations"),
        /permission denied/,
      );
      await assert.rejects(() => authorize("1034"), /permission denied/);
      await assert.rejects(
        () =>
          db.query("SELECT meta_lead_effective_mapping($1,'123','456','111','1001')", [connection]),
        /permission denied/,
      );
    });
});
test("test contact envelope refuses real email/phone and preserves field questions without automatic messaging", async () => {
  await authorize("1040", "115");
  const id = await ingest("1040", "115");
  const result = await process(
    id,
    JSON.stringify({
      full_name: "TESTE SINTÉTICO",
      email: "contact@real.example",
      phone: "+5511999999999",
    }),
  );
  assert.equal(result.status, "review");
  assert.equal(
    (await db.query("SELECT id FROM clients WHERE email='contact@real.example'")).rows.length,
    0,
  );
  const preserved = (
    await db.query<{ field_data: Array<{ name: string }> }>(
      "SELECT field_data FROM meta_lead_submissions WHERE leadgen_id='1001'",
    )
  ).rows[0];
  assert.equal(preserved.field_data[0].name, "quando_comprar");
});
test("normal mapped lead creates a client transactionally, while a second intent with open attendance requires review", async () => {
  const id = await ingest("1050", "112");
  assert.equal((await process(id, fields("1050"))).status, "imported");
  const row = (
    await db.query<{ client_id: string; is_synthetic: boolean }>(
      "SELECT client_id,is_synthetic FROM meta_lead_submissions WHERE id=$1",
      [id],
    )
  ).rows[0];
  assert.ok(row.client_id);
  assert.equal(row.is_synthetic, false);
  const second = await ingest("1051", "112");
  assert.equal((await process(second, fields("1050"))).status, "review");
  assert.equal(
    (await db.query("SELECT id FROM clients WHERE email='meta-test-1050@example.invalid'")).rows
      .length,
    1,
  );
  assert.equal(
    (await db.query("SELECT id FROM attendances WHERE email='meta-test-1050@example.invalid'")).rows
      .length,
    1,
  );
});
test("privacy erasure and lease fencing prevent test resurrection", async () => {
  await authorize("1060", "116");
  const id = await ingest("1060", "116");
  await process(id, fields("1060"));
  const client = (
    await db.query<{ client_id: string }>(
      "SELECT client_id FROM meta_lead_submissions WHERE id=$1",
      [id],
    )
  ).rows[0].client_id;
  await db.query("DELETE FROM clients WHERE id=$1", [client]);
  await ingest("1060", "116");
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::integer count FROM meta_lead_submissions WHERE leadgen_id='1060'",
      )
    ).rows[0].count,
    1,
  );
  await assert.rejects(() => db.query("SELECT meta_lead_retry($1)", [id]), /cannot be retried/);
  await assert.rejects(() => authorize("1060", "116"), /cannot become/);
  await assert.rejects(
    () => db.query("SELECT meta_lead_mapping_for_submission($1,$2,'116')", [id, randomUUID()]),
    /Stale lead lease/,
  );
});

test("single-connection real lead still requires a real mapping; test does not grant the whole form", async () => {
  const con = (
    await db.query<{ id: string }>(
      "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,app_id,page_id,external_account_id) VALUES($1,'meta','cordial','system_user','223','556','557') RETURNING id",
      [broker],
    )
  ).rows[0].id;
  await authorize("1100", "211", admin, admin, con);
  await db.query("SELECT meta_lead_ingest('223',$1)", [
    JSON.stringify([{ page_id: "556", form_id: "211", leadgen_id: "1101" }]),
  ]);
  const id = (
    await db.query<{ id: string }>("SELECT id FROM meta_lead_submissions WHERE leadgen_id='1101'")
  ).rows[0].id;
  assert.equal((await process(id, fields("1101"))).status, "review");
  assert.equal(
    (await db.query("SELECT id FROM clients WHERE email='meta-test-1101@example.invalid'")).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("SELECT id FROM meta_lead_form_mappings WHERE form_id='211'")).rows.length,
    0,
  );
  await db.query("UPDATE ad_platform_connections SET page_id='557' WHERE id=$1", [con]);
  await db.query("UPDATE ad_platform_connections SET page_id='556' WHERE id=$1", [con]);
  assert.equal(
    (
      await db.query<{ enabled: boolean }>(
        "SELECT enabled FROM meta_lead_test_authorizations WHERE leadgen_id='1100'",
      )
    ).rows[0].enabled,
    false,
  );
  assert.equal(
    (
      await db.query("SELECT * FROM meta_lead_effective_mapping($1,'223','556','211','1100')", [
        con,
      ])
    ).rows.length,
    0,
  );
});

test("business report funnel excludes synthetic submissions and their attendances", async () => {
  await asAuthenticated(admin, async () => {
    const result = await db.query<{
      snapshot: { funnel: { submissions: number; attendances: number } };
    }>("SELECT marketing_report_snapshot('cordial',current_date-1,current_date+1) snapshot");
    // Two normal mapped intentions plus the unmapped real event on a unique Page.
    assert.equal(result.rows[0].snapshot.funnel.submissions, 3);
    assert.equal(result.rows[0].snapshot.funnel.attendances, 1);
  });
});
