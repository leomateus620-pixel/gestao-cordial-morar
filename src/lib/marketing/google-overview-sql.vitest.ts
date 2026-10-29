import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { googleOverviewDto, googleOverviewQuerySchema } from "./google-overview.functions";

it("accepts the actual SQL response and keeps precision, partial coverage and finance masking", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION public.marketing_can_act(action text,agency text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION public.marketing_can_read(agency text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT agency='cordial' $$;
      CREATE TABLE ad_platform_connections(id uuid PRIMARY KEY,platform text,imobiliaria text,external_account_id text);
      CREATE TABLE ad_accounts(id uuid PRIMARY KEY,connection_id uuid,platform text,external_account_id text,currency text,timezone text,name text);
      CREATE TABLE marketing_campaigns(id uuid PRIMARY KEY,nome text,status text,imobiliaria text,external_account_id text,last_synced_at timestamptz,updated_at timestamptz,ad_account_id uuid,connection_id uuid,platform text,data_inicio date,data_fim date);
      CREATE TABLE marketing_daily_metrics(campaign_id uuid,data date,spend numeric,impressions numeric,clicks int,conversions numeric,metric_source text);`);
    await db.exec(
      await readFile(
        new URL("../../../drizzle/migrations/0059_google_marketing_overview.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`INSERT INTO ad_platform_connections VALUES ('00000000-0000-4000-8000-000000000001','google','cordial','1234567890');
      INSERT INTO ad_accounts VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','google','1234567890','BRL','America/Sao_Paulo','Conta direta');
      INSERT INTO marketing_campaigns VALUES ('00000000-0000-4000-8000-000000000003','Campanha','Ativa','cordial','1234567890',now(),now(),'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','google','2026-10-01','2026-10-31');
      INSERT INTO marketing_daily_metrics VALUES ('00000000-0000-4000-8000-000000000003','2026-10-01',1.234567,100,5,2.75,'synced');`);
    const raw = await db.query<{ result: unknown }>(
      `SELECT google_marketing_overview('cordial','1234567890','2026-10-01','2026-10-28',NULL,NULL,1,25,'name_asc') result`,
    );
    const input = googleOverviewQuerySchema.parse({
      agency: "cordial",
      accountId: "1234567890",
      since: "2026-10-01",
      until: "2026-10-28",
    });
    // Earlier SQL cannot meet the new context contract; fail instead of silently
    // accepting a partially deployed migration.
    expect(() => googleOverviewDto(raw.rows[0].result, input, true)).toThrow();
    await db.exec(
      await readFile(
        new URL("../../../drizzle/migrations/0060_google_overview_context.sql", import.meta.url),
        "utf8",
      ),
    );
    const upgraded = await db.query<{ result: unknown }>(
      `SELECT google_marketing_overview('cordial','1234567890','2026-10-01','2026-10-28',NULL,NULL,1,25,'name_asc') result`,
    );
    const result = googleOverviewDto(upgraded.rows[0].result, input, true);
    expect(result.accountName).toBe("Conta direta");
    expect(result.accounts).toEqual([
      { id: "1234567890", name: "Conta direta", agency: "cordial" },
    ]);
    expect(result.items[0].dataInicio).toBe("2026-10-01");
    expect(result.summary.cost).toBe("1.234567");
    expect(result.summary.conversions).toBe("2.75");
    expect(result.items[0].dailySeries?.[0].metrics.conversions).toBe("2.75");
    expect(result.coverage).toBe("partial");
    expect(
      googleOverviewDto(upgraded.rows[0].result, input, false).items[0].dailySeries?.[0].metrics
        .cost,
    ).toBeNull();
    const noRows = await db.query<{ result: unknown }>(
      `SELECT google_marketing_overview('cordial','1234567890','2026-10-02','2026-10-28',NULL,NULL,1,25,'name_asc') result`,
    );
    const emptyInput = googleOverviewQuerySchema.parse({
      agency: "cordial",
      accountId: "1234567890",
      since: "2026-10-02",
      until: "2026-10-28",
    });
    const empty = googleOverviewDto(noRows.rows[0].result, emptyInput, true);
    expect(empty.coverage).toBe("unavailable");
    expect(empty.summary.cost).toBeNull();
    expect(empty.series).toBeNull();
    expect(empty.items[0].dailySeries).toBeNull();
  } finally {
    await db.close();
  }
});
