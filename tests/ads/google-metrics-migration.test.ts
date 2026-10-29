import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("Google metrics migration preserves fractional conversions, expense precision and Meta contract", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.ad_sync_jobs(id uuid PRIMARY KEY,campaign_id uuid,status text,worker_id uuid,lease_until timestamptz,range_start date,range_end date,finished_at timestamptz,error text);
      CREATE TABLE public.marketing_campaigns(id uuid PRIMARY KEY,user_id uuid,connection_id uuid,platform text,nome text,status text,period_insights jsonb,last_synced_at timestamptz,sync_status text,sync_error text,investimento numeric(14,2));
      CREATE TABLE public.marketing_daily_metrics(campaign_id uuid,user_id uuid,data date,leads integer,clicks integer,accesses integer,views integer,investimento numeric(14,2),impressions numeric,reach numeric,frequency numeric,spend numeric,cpc numeric,cpm numeric,ctr numeric,conversions numeric,metric_source text,provider_actions jsonb,lead_action_type text,landing_page_views numeric,UNIQUE(campaign_id,data));
    `);
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0057_google_metrics_contract.sql", import.meta.url),
        "utf8",
      ),
    );
    const access = await db.query<{ service: boolean; authenticated: boolean; anon: boolean }>(
      `SELECT has_function_privilege('service_role','public.ad_google_metrics_contract_version()','EXECUTE') service,has_function_privilege('authenticated','public.ad_google_metrics_contract_version()','EXECUTE') authenticated,has_function_privilege('anon','public.ad_google_metrics_contract_version()','EXECUTE') anon`,
    );
    assert.deepEqual(access.rows[0], { service: true, authenticated: false, anon: false });
    const worker = randomUUID(),
      user = randomUUID();
    async function prepare(platform: string) {
      const campaign = randomUUID(),
        job = randomUUID();
      await db.query(
        "INSERT INTO marketing_campaigns(id,user_id,connection_id,platform,nome,status,investimento) VALUES($1,$2,$3,$4,'Test','Ativa',0)",
        [campaign, user, randomUUID(), platform],
      );
      await db.query(
        "INSERT INTO ad_sync_jobs(id,campaign_id,status,worker_id,lease_until,range_start,range_end) VALUES($1,$2,'running',$3,now()+interval '1 hour','2026-10-01','2026-10-02')",
        [job, campaign, worker],
      );
      return { campaign, job };
    }
    const google = await prepare("google");
    const metric = {
      date: "2026-10-01",
      leads: 0,
      clicks: 1,
      spend: "0.000001",
      conversions: 2.75,
    };
    await assert.rejects(
      db.query("SELECT ad_sync_commit($1,$2,$3::jsonb,$4::jsonb)", [
        google.job,
        worker,
        JSON.stringify([{ ...metric, conversions: null }]),
        "{}",
      ]),
      /Google conversions missing/,
    );
    await db.query("SELECT ad_sync_commit($1,$2,$3::jsonb,$4::jsonb)", [
      google.job,
      worker,
      JSON.stringify([metric]),
      "{}",
    ]);
    const g = await db.query<{ leads: number; conversions: string; spend: string }>(
      "SELECT leads,conversions::text,spend::text FROM marketing_daily_metrics WHERE campaign_id=$1",
      [google.campaign],
    );
    assert.deepEqual(g.rows[0], { leads: 0, conversions: "2.75", spend: "0.000001" });
    const meta = await prepare("meta");
    await db.query("SELECT ad_sync_commit($1,$2,$3::jsonb,$4::jsonb)", [
      meta.job,
      worker,
      JSON.stringify([{ date: "2026-10-01", leads: 3, clicks: 1, spend: 1 }]),
      "{}",
    ]);
    const m = await db.query<{ leads: number; conversions: string }>(
      "SELECT leads,conversions::text FROM marketing_daily_metrics WHERE campaign_id=$1",
      [meta.campaign],
    );
    assert.deepEqual(m.rows[0], { leads: 3, conversions: "3" });
  } finally {
    await db.close();
  }
});
