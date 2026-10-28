import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import {
  createAuthorizationFixture,
  admin,
  secretary,
  reviewer,
  mixed,
} from "./authorization-fixture";
let db: PGlite;
const hash = "a".repeat(64);
before(async () => {
  db = await createAuthorizationFixture();
  await db.exec(
    "CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])",
  );
  for (const name of ["0049_marketing_private_reports", "0056_marketing_report_jobs"])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
});
after(async () => db?.close());
function snapshot(total = 501, financial = false, agency = "cordial") {
  return {
    version: 1,
    total,
    rows: Array.from({ length: total }, (_, id) => ({ id: String(id), name: `SYNTHETIC ${id}` })),
    financialVisible: financial,
    scope: {
      imobiliaria: agency,
      type: "detailed",
      filters: { since: "2026-10-01", until: "2026-10-28" },
    },
  };
}
async function enqueue(actor = admin, model = snapshot()) {
  const id = randomUUID();
  await db.query("SELECT marketing_report_enqueue($1,$2,$3,$4)", [
    id,
    actor,
    JSON.stringify(model),
    hash,
  ]);
  return id;
}
async function claim(id: string, worker = randomUUID()) {
  await db.exec("SET ROLE service_role");
  try {
    return await db.query<{
      id: string;
      fence: number;
      worker_id: string;
      snapshot: { rows: unknown[] };
      attempts: number;
    }>("SELECT * FROM marketing_report_claim($1,$2)", [worker, id]);
  } finally {
    await db.exec("RESET ROLE");
  }
}
function path(id: string, fence: number, actor = admin) {
  return `cordial/${actor}/${id}/v1-${hash.slice(0, 16)}-f${fence}.pdf`;
}
test("all authorized snapshot rows persist and remain immutable after request ends", async () => {
  const id = await enqueue();
  const claimed = (await claim(id)).rows[0];
  assert.equal(claimed.snapshot.rows.length, 501);
  await assert.rejects(
    () =>
      db.query(
        "UPDATE marketing_reports SET snapshot=jsonb_set(snapshot,'{total}','25'),row_count=25 WHERE id=$1",
        [id],
      ),
    /immutable/,
  );
  await assert.rejects(
    () => db.query("UPDATE marketing_reports SET imobiliaria='morar' WHERE id=$1", [id]),
    /immutable/,
  );
  assert.equal((await claim(id)).rows.length, 0);
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT marketing_report_commit($1,$2,$3,$4) ok", [
        id,
        claimed.worker_id,
        claimed.fence,
        path(id, claimed.fence),
      ])
    ).rows[0].ok,
    true,
  );
  const saved = (
    await db.query<{ status: string; row_count: number }>(
      "SELECT status,row_count FROM marketing_reports WHERE id=$1",
      [id],
    )
  ).rows[0];
  assert.deepEqual(saved, { status: "ready", row_count: 501 });
});
test("expired worker is fenced, takeover persists the same snapshot and has a new private filename", async () => {
  const id = await enqueue();
  const first = (await claim(id)).rows[0];
  await db.query("UPDATE marketing_reports SET lease_until=now()-interval '1 second' WHERE id=$1", [
    id,
  ]);
  const next = (await claim(id)).rows[0];
  assert.equal(next.fence, first.fence + 1);
  assert.equal(next.snapshot.rows.length, 501);
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT marketing_report_check_lease($1,$2,$3) ok", [
        id,
        first.worker_id,
        first.fence,
      ])
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT marketing_report_commit($1,$2,$3,$4) ok", [
        id,
        first.worker_id,
        first.fence,
        path(id, first.fence),
      ])
    ).rows[0].ok,
    false,
  );
  await assert.rejects(
    () =>
      db.query("SELECT marketing_report_commit($1,$2,$3,$4)", [
        id,
        next.worker_id,
        next.fence,
        path(id, first.fence),
      ]),
    /Invalid private report path/,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT marketing_report_commit($1,$2,$3,$4) ok", [
        id,
        next.worker_id,
        next.fence,
        path(id, next.fence),
      ])
    ).rows[0].ok,
    true,
  );
});
test("current financial, agency and reviewer restrictions deny enqueue and revoked worker results", async () => {
  for (const actor of [reviewer, mixed])
    await assert.rejects(() => enqueue(actor), /not authorized/);
  await assert.rejects(() => enqueue(secretary, snapshot(501, true)), /not authorized/);
  await assert.rejects(() => enqueue(secretary, snapshot(501, false, "morar")), /not authorized/);
  const id = await enqueue(secretary);
  const before = (await claim(id)).rows[0];
  await db.query("INSERT INTO user_roles VALUES($1,'meta_reviewer')", [secretary]);
  try {
    assert.equal(
      (
        await db.query<{ ok: boolean }>("SELECT marketing_report_commit($1,$2,$3,$4) ok", [
          id,
          before.worker_id,
          before.fence,
          path(id, before.fence, secretary),
        ])
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (await db.query<{ status: string }>("SELECT status FROM marketing_reports WHERE id=$1", [id]))
        .rows[0].status,
      "failed",
    );
  } finally {
    await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='meta_reviewer'", [secretary]);
  }
  const queued = await enqueue(secretary);
  await db.query("DELETE FROM user_agencies WHERE user_id=$1", [secretary]);
  try {
    assert.equal((await claim(queued)).rows.length, 0);
  } finally {
    await db.query("INSERT INTO user_agencies VALUES($1,'cordial')", [secretary]);
  }
  assert.equal(
    (
      await db.query<{ error_code: string }>(
        "SELECT error_code FROM marketing_reports WHERE id=$1",
        [queued],
      )
    ).rows[0].error_code,
    "authorization_revoked",
  );
});
test("transient failures have bounded retries and incomplete snapshots cannot be queued", async () => {
  const malformed = snapshot(501);
  malformed.rows = malformed.rows.slice(0, 25);
  await assert.rejects(() => enqueue(admin, malformed), /Incomplete/);
  const id = await enqueue();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const job = (await claim(id)).rows[0];
    assert.equal(job.attempts, attempt);
    await db.query("SELECT marketing_report_fail($1,$2,$3,'storage_failed',true)", [
      id,
      job.worker_id,
      job.fence,
    ]);
    await db.query(
      "UPDATE marketing_reports SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
      [id],
    );
  }
  assert.equal((await claim(id)).rows.length, 0);
  assert.equal(
    (await db.query<{ status: string }>("SELECT status FROM marketing_reports WHERE id=$1", [id]))
      .rows[0].status,
    "failed",
  );
});
test("authenticated callers cannot claim, forge or commit service report jobs", async () => {
  const id = await enqueue();
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.exec("SET ROLE authenticated");
  try {
    await assert.rejects(
      () => db.query("SELECT marketing_report_claim($1,$2)", [randomUUID(), id]),
      /permission denied/,
    );
    await assert.rejects(() => enqueue(), /permission denied/);
    await assert.rejects(
      () => db.query("SELECT marketing_report_commit($1,$2,1,'x')", [id, randomUUID()]),
      /permission denied/,
    );
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("a null fence cannot renew, commit or fail an otherwise valid worker lease", async () => {
  const id = await enqueue();
  const job = (await claim(id)).rows[0];
  for (const query of [
    "SELECT marketing_report_check_lease($1,$2,NULL) ok",
    "SELECT marketing_report_commit($1,$2,NULL,'invalid') ok",
    "SELECT marketing_report_fail($1,$2,NULL,'generation_failed',false) ok",
  ]) {
    assert.equal((await db.query<{ ok: boolean }>(query, [id, job.worker_id])).rows[0].ok, false);
  }
  assert.equal(
    (await db.query<{ status: string }>("SELECT status FROM marketing_reports WHERE id=$1", [id]))
      .rows[0].status,
    "processing",
  );
});
