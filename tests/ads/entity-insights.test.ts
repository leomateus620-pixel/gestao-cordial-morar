import { before, after, test } from "node:test";
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
let campaign: string;
const since = "2026-10-01",
  until = "2026-10-28";
before(async () => {
  db = await createAuthorizationFixture();
  await db.exec(
    await readFile(
      new URL("../../drizzle/migrations/0052_meta_entity_insights.sql", import.meta.url),
      "utf8",
    ),
  );
  const conn = (
    await db.query<{ id: string }>(
      "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,external_account_id) VALUES($1,'meta','cordial','system_user','1') RETURNING id",
      [admin],
    )
  ).rows[0].id;
  const account = (
    await db.query<{ id: string }>(
      "INSERT INTO ad_accounts(connection_id,platform,external_account_id,currency,timezone) VALUES($1,'meta','1','BRL','America/Sao_Paulo') RETURNING id",
      [conn],
    )
  ).rows[0].id;
  campaign = (
    await db.query<{ id: string }>(
      "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,platform,connection_id,ad_account_id,external_account_id,external_campaign_id) VALUES($1,'cordial','Hierarchy','Facebook','Leads','2026-10-01','2026-10-28','meta',$2,$3,'1','2') RETURNING id",
      [admin, conn, account],
    )
  ).rows[0].id;
});
after(async () => db?.close());
const enqueue = async (actor = admin, grain = "period") =>
  (
    await db.query<{ id: string }>(
      "SELECT meta_insight_enqueue($1,$2,'ad',$3,'none',$4,$5,'v26.0') id",
      [campaign, actor, grain, since, until],
    )
  ).rows[0].id;
async function claim() {
  const worker = randomUUID();
  const jobs = await db.query<{ id: string; status: string }>(
    "SELECT id,status FROM meta_insight_claim($1)",
    [worker],
  );
  return { worker, rows: jobs.rows };
}
const checkpoint = (id: string, worker: string, status: string, report: string | null = null) =>
  db.query("SELECT meta_insight_checkpoint($1,$2,$3,$4,50,NULL,NULL,'BRL','America/Sao_Paulo')", [
    id,
    worker,
    status,
    report,
  ]);
const row = (id = "4", spend = "12.34") => ({
  entityId: id,
  accountId: "1",
  campaignId: "2",
  adsetId: "3",
  dateStart: since,
  dateStop: until,
  breakdown: {},
  impressions: "100",
  clicks: "2",
  inlineLinkClicks: "1",
  spend,
  leads: "1",
  leadActionType: "onsite_conversion.lead_grouped",
  reach: "80",
  frequency: "1.25",
  landingPageViews: null,
  attribution: null,
});
async function as<T>(actor: string, run: () => Promise<T>) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec("SET ROLE authenticated");
  try {
    return await run();
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  }
}
const snapshot = async () =>
  (
    await db.query<{
      value: {
        job: { status: string; coverage: string };
        snapshotJobId: string | null;
        rows: Array<{ spend: string | null }>;
        total: number;
        financialVisible: boolean;
      };
    }>("SELECT meta_insight_snapshot($1,'ad','period','none',$2,$3) value", [
      campaign,
      since,
      until,
    ])
  ).rows[0].value;
test("service-only enqueue still validates actor; authenticated cannot invoke worker RPC", async () => {
  for (const actor of [reviewer, mixed]) await assert.rejects(enqueue(actor), /Sem permissão/);
  await as(
    admin,
    async () =>
      await assert.rejects(
        db.query("SELECT meta_insight_claim($1)", [randomUUID()]),
        /permission denied/,
      ),
  );
});
test("double click reuses active job; stale submitting is uncertain and never submits again", async () => {
  const first = await enqueue();
  assert.equal(await enqueue(), first);
  const lease = await claim();
  assert.equal(lease.rows[0].id, first);
  assert.equal((await claim()).rows.length, 0);
  await db.query("UPDATE meta_insight_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [
    first,
  ]);
  assert.equal((await claim()).rows.length, 0);
  assert.equal(
    (
      await db.query<{ status: string }>("SELECT status FROM meta_insight_jobs WHERE id=$1", [
        first,
      ])
    ).rows[0].status,
    "uncertain",
  );
  assert.equal(await enqueue(), first);
  await db.query("SELECT meta_insight_cancel($1,$2)", [first, admin]);
  await assert.rejects(checkpoint(first, lease.worker, "polling", "10"), /Stale insight lease/);
});
test("checkpointed pages stay hidden until complete; earlier snapshot survives failed revision", async () => {
  const id = await enqueue();
  const submitted = await claim();
  await checkpoint(id, submitted.worker, "polling", "10");
  await db.query("UPDATE meta_insight_jobs SET next_attempt_at=now() WHERE id=$1", [id]);
  const polled = await claim();
  await checkpoint(id, polled.worker, "collecting");
  await db.query("UPDATE meta_insight_jobs SET next_attempt_at=now() WHERE id=$1", [id]);
  const page1 = await claim();
  await db.query("SELECT meta_insight_append($1,$2,NULL,$3,$4::jsonb)", [
    id,
    page1.worker,
    "next",
    JSON.stringify([row()]),
  ]);
  await as(admin, async () => {
    assert.equal((await snapshot()).total, 0);
    assert.equal((await snapshot()).job.coverage, "partial");
  });
  const page2 = await claim();
  await assert.rejects(
    db.query("SELECT meta_insight_append($1,$2,$3,$4,$5::jsonb)", [
      id,
      page2.worker,
      "wrong",
      null,
      JSON.stringify([row("5")]),
    ]),
    /Invalid page checkpoint/,
  );
  await assert.rejects(
    db.query("SELECT meta_insight_append($1,$2,$3,$4,$5::jsonb)", [
      id,
      page2.worker,
      "next",
      "next",
      JSON.stringify([row("5")]),
    ]),
    /Cyclic cursor/,
  );
  await db.query("SELECT meta_insight_append($1,$2,$3,NULL,$4::jsonb)", [
    id,
    page2.worker,
    "next",
    JSON.stringify([row("5")]),
  ]);
  await as(admin, async () => {
    const s = await snapshot();
    assert.equal(s.total, 2);
    assert.equal(s.rows[0].spend, "12.34");
    assert.equal(s.job.status, "completed");
  });
  for (const actor of [secretary, mixed])
    await as(actor, async () => {
      const s = await snapshot();
      assert.equal(s.total, 2);
      assert.equal(s.financialVisible, false);
      assert.equal(s.rows[0].spend, null);
      await assert.rejects(db.query("SELECT * FROM meta_entity_insights"), /permission denied/);
    });
  const revision = await enqueue();
  const lease = await claim();
  await checkpoint(revision, lease.worker, "failed");
  await as(admin, async () => {
    const s = await snapshot();
    assert.equal(s.snapshotJobId, id);
    assert.equal(s.rows.length, 2);
    assert.equal(s.job.status, "failed");
  });
});
test("SQL rejects cross-context rows and nonmatching dates; empty completed report is explicit", async () => {
  const id = await enqueue();
  const lease = await claim();
  await checkpoint(id, lease.worker, "collecting", "11");
  await db.query("UPDATE meta_insight_jobs SET next_attempt_at=now() WHERE id=$1", [id]);
  const collection = await claim();
  await assert.rejects(
    db.query("SELECT meta_insight_append($1,$2,NULL,NULL,$3::jsonb)", [
      id,
      collection.worker,
      JSON.stringify([{ ...row(), accountId: "9" }]),
    ]),
    /outside scope/,
  );
  await assert.rejects(
    db.query("SELECT meta_insight_append($1,$2,NULL,NULL,$3::jsonb)", [
      id,
      collection.worker,
      JSON.stringify([{ ...row(), dateStop: "2026-10-27" }]),
    ]),
    /outside scope/,
  );
  await db.query("SELECT meta_insight_append($1,$2,NULL,NULL,'[]'::jsonb)", [
    id,
    collection.worker,
  ]);
  await as(admin, async () => {
    const s = await snapshot();
    assert.equal(s.snapshotJobId, id);
    assert.equal(s.total, 0);
    assert.equal(s.job.coverage, "collected_empty");
  });
});
test("daily/period reports are separate scopes and polling window expires without retrying POST", async () => {
  const daily = await enqueue(admin, "daily");
  const lease = await claim();
  await checkpoint(daily, lease.worker, "polling", "12");
  await db.query(
    "UPDATE meta_insight_jobs SET created_at=now()-interval '25 hours',next_attempt_at=now() WHERE id=$1",
    [daily],
  );
  await claim();
  assert.equal(
    (
      await db.query<{ status: string }>("SELECT status FROM meta_insight_jobs WHERE id=$1", [
        daily,
      ])
    ).rows[0].status,
    "expired",
  );
  await as(admin, async () => assert.equal((await snapshot()).job.coverage, "collected_empty"));
});

test("fixed export includes all authorized rows and masks finance under actual roles", async () => {
  const id = await enqueue();
  const lease = await claim();
  await checkpoint(id, lease.worker, "collecting", "99");
  await db.query("UPDATE meta_insight_jobs SET next_attempt_at=now() WHERE id=$1", [id]);
  const collection = await claim();
  await db.query("SELECT meta_insight_append($1,$2,NULL,NULL,$3::jsonb)", [
    id,
    collection.worker,
    JSON.stringify(Array.from({ length: 28 }, (_, i) => row(String(100 + i)))),
  ]);
  const exported = async (jobId = id) =>
    (
      await db.query<{
        value: {
          total: number;
          jobId: string;
          rows: Array<{ spend: string | null }>;
          financialVisible: boolean;
        };
      }>("SELECT meta_insight_export_snapshot($1) value", [jobId])
    ).rows[0].value;
  await as(admin, async () => {
    const s = await exported();
    assert.equal(s.total, 28);
    assert.equal(s.rows.length, 28);
    assert.equal(s.jobId, id);
    assert.equal(s.rows[27].spend, "12.34");
  });
  await as(secretary, async () => {
    const s = await exported();
    assert.equal(s.financialVisible, false);
    assert.equal(
      s.rows.every((r) => r.spend === null),
      true,
    );
  });
  for (const actor of [reviewer, mixed])
    await as(actor, async () => assert.rejects(exported(), /Sem permissão/));
  // The selected completed version stays fixed even while a new version is queued.
  const revision = await enqueue();
  await as(admin, async () => {
    assert.equal((await exported()).jobId, id);
    await assert.rejects(exported(revision), /snapshot indisponível/);
  });
  await db.query("DELETE FROM user_agencies WHERE user_id=$1", [secretary]);
  await as(secretary, async () => assert.rejects(exported(), /Sem permissão/));
  await db.query("INSERT INTO user_agencies VALUES($1,'cordial')", [secretary]);
  await assert.rejects(
    db.query("UPDATE marketing_campaigns SET external_campaign_id='999' WHERE id=$1", [campaign]),
    /foreign key/,
  );
});
