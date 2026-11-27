import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const src = "../../drizzle/migrations/";
const migrations = [
  new URL(src + "0116_site_audience.sql", import.meta.url),
  new URL(src + "0117_site_audience_production_config.sql", import.meta.url),
];
const notice =
  "Aviso de teste que descreve a finalidade, os dados utilizados e a revogação da medição de audiência.";

test("production activation requires verified ingress, immutable notices and independent Vault keys", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION public.is_atendimentos_viewer() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE public.cordial_site_eligible(public_id uuid PRIMARY KEY);
      CREATE TABLE public.morar_site_eligible(public_id uuid PRIMARY KEY);
      CREATE SCHEMA vault;
      CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
      CREATE VIEW vault.decrypted_secrets AS SELECT id, secret AS decrypted_secret FROM vault.secrets;
      CREATE FUNCTION vault.create_secret(p_secret text, p_name text, p_description text, p_key uuid)
      RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(name,secret) VALUES($2,$1) RETURNING id $$;
      REVOKE ALL ON SCHEMA vault FROM PUBLIC;
    `);
    for (const migration of migrations) await db.exec(await readFile(migration, "utf8"));
    const activate = (
      brand: string,
      version = "audiencia-v1",
      approved = notice,
      ingress = true,
      pairs = '[{"source":"google","medium":"cpc"}]',
    ) =>
      db.query(
        `
      SELECT public.site_audience_production_configure($1,true,$2,$3,$4,$5,'{outono}','{parceiro.com.br}')
    `,
        [brand, version, approved, ingress, pairs],
      );
    const get = async (brand: string) =>
      (
        await db.query<{
          value: { policyVersion: string; notice: string; secret: string } | null;
        }>("SELECT public.site_audience_production_settings($1) AS value", [brand])
      ).rows[0]?.value;
    const open = async () =>
      (
        await db.query<{ brand: string }>(`
      SELECT brand FROM site_audience.coverage WHERE environment='production' AND ended_at IS NULL ORDER BY brand
    `)
      ).rows.map((row) => row.brand);
    const shutdown = (brand: string) =>
      db.query("SELECT public.site_audience_production_configure($1,false)", [brand]);

    assert.equal(await get("cordial"), null);
    assert.deepEqual(await open(), []);
    assert.equal((await db.query("SELECT id FROM vault.secrets")).rows.length, 0);
    await assert.rejects(
      activate("cordial", "audiencia-v1", notice, false),
      /verified production ingress/,
    );
    await assert.rejects(activate("cordial", "audiencia-v1", "short"), /Approved notice/);
    await assert.rejects(
      activate(
        "cordial",
        "audiencia-v1",
        notice,
        true,
        '[{"source":"x","medium":"y","secret":"z"}]',
      ),
      /allowlist/,
    );
    assert.deepEqual(await open(), []);

    await activate("cordial");
    const first = await get("cordial");
    assert.ok(first);
    assert.equal(first.notice, notice);
    assert.match(first.secret, /^[a-f0-9]{64}$/);
    assert.equal(await get("morar"), null);
    assert.deepEqual(await open(), ["cordial"]);

    await activate("morar");
    assert.notEqual((await get("morar"))?.secret, first.secret);
    assert.deepEqual(await open(), ["cordial", "morar"]);
    await activate("cordial", "audiencia-v2", notice + " Outra finalidade.");
    assert.equal((await get("cordial"))?.policyVersion, "audiencia-v2");
    await assert.rejects(
      activate("cordial", "audiencia-v1", notice + " Editado."),
      /new policy version/,
    );
    assert.equal((await get("cordial"))?.policyVersion, "audiencia-v2");
    await activate("cordial", "audiencia-v1");
    assert.equal((await get("cordial"))?.secret, first.secret);

    await shutdown("cordial");
    assert.equal(await get("cordial"), null);
    assert.deepEqual(await open(), ["morar"]);
    await assert.rejects(
      db.query("SELECT public.site_audience_configure('cordial','production','audiencia-v1',true)"),
      /approved audience configuration/,
    );
    assert.equal(await get("cordial"), null);
    await shutdown("cordial");
    assert.deepEqual(await open(), ["morar"]);

    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(
        db.query("SELECT * FROM site_audience.production_config"),
        /permission denied/,
      );
      await assert.rejects(db.query("SELECT * FROM vault.decrypted_secrets"), /permission denied/);
      if (role === "service_role") {
        assert.ok(await get("morar"));
        await shutdown("morar");
      } else {
        await assert.rejects(get("morar"), /permission denied/);
        await assert.rejects(shutdown("morar"), /permission denied/);
      }
      await db.exec("RESET ROLE");
    }
    assert.deepEqual(await open(), []);
  } finally {
    await db.close();
  }
});
