import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/** Banco isolado mínimo com a função real do gatilho (migration 0001). */
async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE public.properties (id uuid PRIMARY KEY, codigo_cordial text, codigo_morar text);
    CREATE TABLE public.property_drive_folders (property_id uuid PRIMARY KEY, property_folder_id text);
    CREATE TABLE public.property_drive_jobs (id serial PRIMARY KEY, property_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending');
    CREATE UNIQUE INDEX property_drive_jobs_active_idx ON public.property_drive_jobs (property_id)
      WHERE status IN ('pending','processing','retry');
  `);
  await pg.exec(
    await readFile(new URL("../../drizzle/migrations/0001_drive_rename_on_conflict.sql", import.meta.url), "utf8"),
  );
  await pg.exec(`CREATE TRIGGER t AFTER UPDATE OF codigo_cordial, codigo_morar ON public.properties
    FOR EACH ROW EXECUTE FUNCTION public.property_drive_rename_on_codes();`);
  return pg;
}
const ID = "00000000-0000-0000-0000-000000000001";
const jobs = async (pg: PGlite) =>
  (await pg.query<{ n: number }>(`SELECT count(*)::int n FROM property_drive_jobs`)).rows[0].n;

test("job ativo já existente: códigos gravados e nenhum job extra", async () => {
  const pg = await db();
  await pg.exec(`INSERT INTO properties VALUES ('${ID}', null, null);
    INSERT INTO property_drive_folders VALUES ('${ID}', 'f');
    INSERT INTO property_drive_jobs (property_id, status) VALUES ('${ID}', 'processing');`);
  await pg.exec(`UPDATE properties SET codigo_cordial='1399', codigo_morar='3398' WHERE id='${ID}'`);
  const row = (await pg.query<{ c: string }>(`SELECT codigo_cordial c FROM properties`)).rows[0];
  assert.equal(row.c, "1399");
  assert.equal(await jobs(pg), 1);
});

test("conflito no INSERT (corrida) não desfaz a gravação dos códigos", async () => {
  const pg = await db();
  await pg.exec(`INSERT INTO properties VALUES ('${ID}', null, null);
    INSERT INTO property_drive_folders VALUES ('${ID}', 'f');`);
  // Simula a corrida: o job ativo surge depois do NOT EXISTS, via outro gatilho anterior.
  await pg.exec(`CREATE FUNCTION race() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO property_drive_jobs (property_id) VALUES (NEW.id); RETURN NEW; END $$;`);
  await pg.exec(`UPDATE properties SET codigo_cordial='1' WHERE id='${ID}'`);
  assert.equal(await jobs(pg), 1);
  await pg.exec(`UPDATE property_drive_jobs SET status='done'`);
  await pg.exec(`UPDATE properties SET codigo_morar='2' WHERE id='${ID}'`);
  assert.equal(await jobs(pg), 2);
  const r = (await pg.query<{ m: string }>(`SELECT codigo_morar m FROM properties`)).rows[0];
  assert.equal(r.m, "2");
});

test("sem pasta do Drive: não cria job", async () => {
  const pg = await db();
  await pg.exec(`INSERT INTO properties VALUES ('${ID}', null, null);`);
  await pg.exec(`UPDATE properties SET codigo_cordial='1' WHERE id='${ID}'`);
  assert.equal(await jobs(pg), 0);
});
