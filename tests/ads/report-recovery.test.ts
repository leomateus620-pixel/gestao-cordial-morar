import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import {
  createAuthorizationFixture,
  admin,
  secretary,
  broker,
  reviewer,
  mixed,
} from "./authorization-fixture";
let db: PGlite;
before(async () => {
  db = await createAuthorizationFixture();
  await db.exec(
    "CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  for (const name of [
    "0049_marketing_private_reports",
    "0050_meta_lead_recovery_history",
    "0051_meta_metric_reconciliation",
  ])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
});
after(async () => db?.close());
async function as<T>(id: string, action: () => Promise<T>) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
test("snapshot spans all authorized pages and denies reviewer, mixed roles and other agency", async () => {
  await db.query(
    "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,investimento) SELECT $1,'cordial','Synthetic '||g,'Facebook','Leads','2026-10-01','2026-10-31',100 FROM generate_series(1,125) g",
    [admin],
  );
  await as(secretary, async () => {
    const r = await db.query<{
      v: { items: Array<Record<string, unknown>>; total: number; financial_visible: boolean };
    }>("SELECT marketing_report_snapshot('cordial','2026-10-01','2026-10-31') v");
    assert.equal(r.rows[0].v.total, 126);
    assert.equal(r.rows[0].v.items.length, 126);
    assert.equal(r.rows[0].v.financial_visible, false);
    assert.ok(r.rows[0].v.items.every((x) => x.investimento === null));
    await assert.rejects(() =>
      db.query("SELECT marketing_report_snapshot('morar','2026-10-01','2026-10-31')"),
    );
  });
  for (const id of [reviewer, mixed, broker])
    await as(id, () =>
      assert.rejects(() =>
        db.query("SELECT marketing_report_snapshot('cordial','2026-10-01','2026-10-31')"),
      ),
    );
  await as(admin, () =>
    assert.rejects(
      () => db.query("SELECT marketing_report_snapshot(NULL,'2026-10-01','2026-10-31')"),
      /Invalid scope/,
    ),
  );
});
test("private reports, history and recovery retain service boundary", async () => {
  for (const id of [secretary, reviewer, mixed, broker])
    await as(id, async () => {
      for (const table of ["marketing_reports", "meta_lead_events", "meta_lead_recovery_jobs"])
        await assert.rejects(() => db.query(`SELECT * FROM ${table}`));
      await assert.rejects(() => db.query("SELECT meta_lead_recovery_claim(gen_random_uuid())"));
    });
  const bucket = await db.query<{ public: boolean }>(
    "SELECT public FROM storage.buckets WHERE id='marketing-reports'",
  );
  assert.equal(bucket.rows[0].public, false);
});
test("recovery deduplicates webhook identity, preserves erasure and fences commit", async () => {
  const conn = await db.query<{ id: string }>(
    "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,app_id,page_id,external_account_id) VALUES($1,'meta','cordial','system_user','123','456','555') RETURNING id",
    [admin],
  );
  const map = await db.query<{ id: string }>(
    "INSERT INTO meta_lead_form_mappings(connection_id,page_id,form_id,imobiliaria,created_by) VALUES($1,'456','111','cordial',$2) RETURNING id",
    [conn.rows[0].id, admin],
  );
  const since = "2026-10-01T00:00:00Z",
    until = "2026-10-02T00:00:00Z";
  let id = "";
  await as(admin, async () => {
    const first = await db.query<{ id: string }>("SELECT meta_lead_recovery_request($1,$2,$3) id", [
      map.rows[0].id,
      since,
      until,
    ]);
    id = first.rows[0].id;
    const second = await db.query<{ id: string }>(
      "SELECT meta_lead_recovery_request($1,$2,$3) id",
      [map.rows[0].id, since, until],
    );
    assert.equal(second.rows[0].id, id);
  });
  await as(secretary, () =>
    assert.rejects(() =>
      db.query("SELECT meta_lead_recovery_request($1,$2,$3)", [map.rows[0].id, since, until]),
    ),
  );
  const worker = randomUUID();
  await db.query("SELECT meta_lead_recovery_claim($1)", [worker]);
  assert.equal(
    (await db.query("SELECT * FROM meta_lead_recovery_claim($1)", [randomUUID()])).rows.length,
    0,
  );
  const events = JSON.stringify([
    { page_id: "456", form_id: "111", leadgen_id: "789", created_time: "2026-10-01T12:00:00Z" },
  ]);
  await assert.rejects(
    () => db.query("SELECT meta_lead_recovery_commit($1,$2,NULL,NULL)", [id, worker]),
    /Invalid recovery page/,
  );
  await assert.rejects(
    () =>
      db.query("SELECT meta_lead_recovery_commit($1,$2,$3,NULL)", [
        id,
        worker,
        JSON.stringify([{ page_id: "456", form_id: "111" }]),
      ]),
    /Recovery context mismatch/,
  );
  await db.query("SELECT meta_lead_ingest('123',$1)", [events]);
  await db.query(
    "UPDATE meta_lead_submissions SET privacy_deleted_at=now(),status='failed',full_name=NULL,phone=NULL WHERE leadgen_id='789'",
  );
  await assert.rejects(() =>
    db.query("SELECT meta_lead_recovery_commit($1,$2,$3,NULL)", [id, randomUUID(), events]),
  );
  await db.query("SELECT meta_lead_recovery_commit($1,$2,$3,NULL)", [id, worker, events]);
  const rows = await db.query<{ privacy_deleted_at: string; status: string }>(
    "SELECT privacy_deleted_at,status FROM meta_lead_submissions WHERE leadgen_id='789'",
  );
  assert.equal(rows.rows.length, 1);
  assert.ok(rows.rows[0].privacy_deleted_at);
  assert.equal(rows.rows[0].status, "failed");
  const job = await db.query<{ status: string }>(
    "SELECT status FROM meta_lead_recovery_jobs WHERE id=$1",
    [id],
  );
  assert.equal(job.rows[0].status, "done");
  assert.equal((await db.query("SELECT * FROM meta_lead_events")).rows.length, 2);
});
