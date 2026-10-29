import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("Google overview authorizes agency and reviewer, aggregates globally without false precision or currency mixing", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.reviewer',true)='yes' $$;
      CREATE FUNCTION public.marketing_can_act(action text,agency text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT CASE WHEN action='financial_report' THEN current_setting('test.financial',true)='yes' ELSE true END $$;
      CREATE FUNCTION public.marketing_can_read(agency text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.agency',true)='all' OR agency=current_setting('test.agency',true) $$;
      CREATE TABLE ad_platform_connections(id uuid PRIMARY KEY,platform text,imobiliaria text,external_account_id text);
      CREATE TABLE ad_accounts(id uuid PRIMARY KEY,connection_id uuid,platform text,external_account_id text,currency text,timezone text,name text);
      CREATE TABLE marketing_campaigns(id uuid PRIMARY KEY,nome text,status text,imobiliaria text,external_account_id text,last_synced_at timestamptz,updated_at timestamptz,ad_account_id uuid,connection_id uuid,platform text,data_inicio date,data_fim date);
      CREATE TABLE marketing_daily_metrics(campaign_id uuid,data date,spend numeric,impressions numeric,clicks int,conversions numeric,metric_source text);
      SELECT set_config('test.reviewer','no',false),set_config('test.financial','yes',false),set_config('test.agency','cordial',false);`);
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0059_google_marketing_overview.sql", import.meta.url),
        "utf8",
      ),
    );
    const invoke = (
      agency: string | null,
      account: string | null,
      page = 1,
      size = 1,
      sort = "name_asc",
    ) =>
      db
        .query<{
          result: any;
        }>(
          "SELECT google_marketing_overview($1,$2,'2026-10-01','2026-10-31',NULL,NULL,$3,$4,$5) result",
          [agency, account, page, size, sort],
        )
        .then((r) => r.rows[0].result);
    async function campaign(
      name: string,
      agency = "cordial",
      currency = "BRL",
      timezone = "America/Sao_Paulo",
    ) {
      const conn = randomUUID(),
        account = randomUUID(),
        id = randomUUID(),
        external = String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
      await db.query("INSERT INTO ad_platform_connections VALUES($1,'google',$2,$3)", [
        conn,
        agency,
        external,
      ]);
      await db.query("INSERT INTO ad_accounts VALUES($1,$2,'google',$3,$4,$5,'Conta verificada')", [
        account,
        conn,
        external,
        currency,
        timezone,
      ]);
      await db.query(
        "INSERT INTO marketing_campaigns VALUES($1,$2,'Ativa',$3,$4,now(),now(),$5,$6,'google','2026-10-01','2037-12-31')",
        [id, name, agency, external, account, conn],
      );
      return { id, external };
    }
    const a = await campaign("A"),
      b = await campaign("B"),
      other = await campaign("Outside", "morar");
    await db.query(
      "UPDATE marketing_campaigns b SET external_account_id=a.external_account_id,ad_account_id=a.ad_account_id,connection_id=a.connection_id FROM marketing_campaigns a WHERE b.id=$1 AND a.id=$2",
      [b.id, a.id],
    );
    await db.query(
      "INSERT INTO marketing_daily_metrics VALUES($1,'2026-10-01',0.000001,10,2,2.75,'synced'),($2,'2026-10-01',0.000002,20,3,0.5,'synced'),($3,'2026-10-01',9,90,9,9,'synced')",
      [a.id, b.id, other.id],
    );
    const one = await invoke("cordial", null),
      two = await invoke("cordial", null, 2);
    assert.equal(one.items[0].name, "A");
    assert.equal(two.items[0].name, "B");
    assert.equal(one.total, 2);
    assert.equal(one.coverage, "partial");
    assert.equal(one.summary.cost, "0.000003");
    assert.equal(one.summary.conversions, "3.25");
    assert.equal(one.summary.clicks, "5");
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0060_google_overview_context.sql", import.meta.url),
        "utf8",
      ),
    );
    const enriched = await invoke("cordial", a.external);
    assert.equal(enriched.accountName, "Conta verificada");
    assert.equal(enriched.items[0].accountName, "Conta verificada");
    assert.equal(enriched.items[0].dataInicio, "2026-10-01");
    assert.equal(enriched.items[0].dataFim, "2037-12-31");
    assert.equal(enriched.summary.conversions, one.summary.conversions);
    assert.equal(enriched.summary.cost, one.summary.cost);
    assert.equal(enriched.coverage, one.coverage);
    assert.ok(enriched.accounts.some((account: { id: string }) => account.id === a.external));
    assert.ok(
      enriched.accounts.every((account: { agency: string }) => account.agency === "cordial"),
    );
    assert.equal((await invoke("cordial", a.external)).accounts.length, 2);
    await db.query(
      "UPDATE ad_platform_connections SET external_account_id=$2 WHERE id=(SELECT connection_id FROM marketing_campaigns WHERE id=$1)",
      [other.id, a.external],
    );
    await db.query(
      "UPDATE ad_accounts SET external_account_id=$2 WHERE id=(SELECT ad_account_id FROM marketing_campaigns WHERE id=$1)",
      [other.id, a.external],
    );
    await db.query("UPDATE marketing_campaigns SET external_account_id=$2 WHERE id=$1", [
      other.id,
      a.external,
    ]);
    await db.exec("SELECT set_config('test.agency','all',false)");
    const both = await invoke(null, null);
    assert.equal(
      both.accounts.filter((account: { id: string }) => account.id === a.external).length,
      2,
    );
    await db.exec("SELECT set_config('test.agency','cordial',false)");
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0059_google_marketing_overview.sql", import.meta.url),
        "utf8",
      ),
    );
    const rolledBack = await invoke("cordial", a.external);
    assert.equal(rolledBack.accountName, undefined);
    assert.equal(rolledBack.items[0].dataInicio, undefined);
    assert.equal(rolledBack.summary.conversions, one.summary.conversions);
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0060_google_overview_context.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(one.items[0].dailySeries[0].metrics.conversions, "2.75");
    assert.equal(one.items[0].dailySeries[0].metrics.cost, "0.000001");
    assert.ok(Math.abs(Number(one.summary.ctr) - 100 / 6) < 0.00001);
    assert.equal(Number(one.summary.cpc), 0.0000006);
    assert.equal((await invoke("cordial", a.external)).total, 2);
    assert.equal(
      (await invoke("cordial", a.external, 1, 1, "impressions_desc")).items[0].name,
      "B",
    );
    assert.equal((await invoke("cordial", a.external, 1, 1, "cost_desc")).items[0].name, "B");
    for (const [sort, expected] of [
      ["clicks_desc", "B"],
      ["conversions_desc", "A"],
      ["ctr_desc", "A"],
      ["cpc_desc", "B"],
      ["cost_per_conversion_desc", "B"],
    ]) {
      assert.equal((await invoke("cordial", a.external, 1, 1, sort)).items[0].name, expected);
    }
    await assert.rejects(invoke("cordial", null, 1, 1, "cost_desc"), /conta específica/);
    await db.query("UPDATE marketing_campaigns SET last_synced_at=NULL WHERE id=$1", [b.id]);
    assert.equal((await invoke("cordial", a.external)).lastCollectedAt, null);
    await db.query("UPDATE marketing_campaigns SET last_synced_at=now() WHERE id=$1", [b.id]);
    const missing = await campaign("Missing");
    await db.query(
      "UPDATE marketing_campaigns b SET external_account_id=a.external_account_id,ad_account_id=a.ad_account_id,connection_id=a.connection_id FROM marketing_campaigns a WHERE b.id=$1 AND a.id=$2",
      [missing.id, a.id],
    );
    const last = await invoke("cordial", a.external, 3, 1, "impressions_desc");
    assert.equal(last.items[0].name, "Missing");
    assert.equal(last.items[0].dailySeries, null);
    await db.query(
      "INSERT INTO marketing_daily_metrics VALUES($1,'2026-10-01',NULL,1,1,NULL,'synced')",
      [missing.id],
    );
    const incomplete = await invoke("cordial", null);
    assert.equal(incomplete.summary.conversions, null);
    assert.equal(incomplete.summary.cost, null);
    await db.query("DELETE FROM marketing_daily_metrics WHERE campaign_id=$1", [missing.id]);
    await db.query("DELETE FROM marketing_campaigns WHERE id=$1", [missing.id]);
    await assert.rejects(invoke("morar", null), /Sem permissão/);
    await db.exec("SELECT set_config('test.financial','no',false)");
    const masked = await invoke("cordial", null);
    assert.equal(masked.summary.cost, null);
    assert.equal(masked.items[0].metrics.cost, null);
    assert.equal(masked.items[0].dailySeries[0].metrics.cost, null);
    assert.equal(masked.summary.cpc, null);
    await assert.rejects(invoke("cordial", a.external, 1, 1, "cost_desc"), /conta específica/);
    assert.equal(masked.summary.conversions, "3.25");
    await db.exec("SELECT set_config('test.financial','yes',false)");
    const secondAccount = await campaign("Another account");
    const separate = await invoke("cordial", null);
    assert.equal(separate.currency, "BRL");
    assert.equal(separate.summary.clicks, null);
    assert.equal(separate.series, null);
    await db.query("DELETE FROM marketing_campaigns WHERE id=$1", [secondAccount.id]);
    const inconsistent = await campaign("Inconsistent", "cordial", "BRL", "America/New_York");
    await db.query(
      "UPDATE ad_platform_connections SET external_account_id=$2 WHERE id=(SELECT connection_id FROM marketing_campaigns WHERE id=$1)",
      [inconsistent.id, a.external],
    );
    await db.query(
      "UPDATE ad_accounts SET external_account_id=$2 WHERE id=(SELECT ad_account_id FROM marketing_campaigns WHERE id=$1)",
      [inconsistent.id, a.external],
    );
    await db.query("UPDATE marketing_campaigns SET external_account_id=$2 WHERE id=$1", [
      inconsistent.id,
      a.external,
    ]);
    await assert.rejects(
      invoke("cordial", a.external, 1, 1, "impressions_desc"),
      /Moeda ou fuso inconsistentes/,
    );
    const unsorted = await invoke("cordial", a.external);
    assert.equal(unsorted.summary.clicks, null);
    await db.query("DELETE FROM marketing_campaigns WHERE id=$1", [inconsistent.id]);
    await campaign("C", "cordial", "USD", "America/New_York");
    const mixed = await invoke("cordial", null);
    assert.equal(mixed.currency, null);
    assert.equal(mixed.timezone, null);
    assert.equal(mixed.summary.cost, null);
    assert.equal(mixed.summary.clicks, null);
    assert.equal(mixed.series, null);
    await db.exec("SELECT set_config('test.reviewer','yes',false)");
    await assert.rejects(invoke("cordial", null), /Sem permissão/);
    const grants = await db.query<{ anon: boolean; auth: boolean }>(
      "SELECT has_function_privilege('anon','google_marketing_overview(text,text,date,date,text,text,integer,integer,text)','execute') anon,has_function_privilege('authenticated','google_marketing_overview(text,text,date,date,text,text,integer,integer,text)','execute') auth",
    );
    assert.deepEqual(grants.rows[0], { anon: false, auth: true });
  } finally {
    await db.close();
  }
});
