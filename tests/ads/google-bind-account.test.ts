import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
test("Google account binding is atomic, scoped, credential-fenced and service-only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE ad_platform_connections(id uuid PRIMARY KEY,platform text,imobiliaria text,external_account_id text,account_label text,status text,last_error text,encrypted_access_token text,access_token text);
      CREATE TABLE ad_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid REFERENCES ad_platform_connections(id),platform text,external_account_id text,name text,currency text,timezone text,UNIQUE(connection_id,external_account_id));`);
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0058_google_bind_account.sql", import.meta.url),
        "utf8",
      ),
    );
    const grants = await db.query<{ service: boolean; auth: boolean; anon: boolean }>(
      `SELECT has_function_privilege('service_role','ad_google_bind_account(uuid,text,text,text,text,text,text,text)','execute') service,has_function_privilege('authenticated','ad_google_bind_account(uuid,text,text,text,text,text,text,text)','execute') auth,has_function_privilege('anon','ad_google_bind_account(uuid,text,text,text,text,text,text,text)','execute') anon`,
    );
    assert.deepEqual(grants.rows[0], { service: true, auth: false, anon: false });
    const connection = randomUUID();
    await db.query(
      "INSERT INTO ad_platform_connections(id,platform,imobiliaria,status,encrypted_access_token) VALUES($1,'google','cordial','error','encrypted-original')",
      [connection],
    );
    const invoke = (agency: string, id: string, fingerprint: string | null) =>
      db.query<{ id: string }>("SELECT ad_google_bind_account($1,$2,$3,$4,$5,$6,$7,$8) id", [
        connection,
        agency,
        id,
        "Account",
        "BRL",
        "America/Sao_Paulo",
        fingerprint,
        null,
      ]);
    await assert.rejects(
      invoke("morar", "1234567890", hash("encrypted-original")),
      /outside account scope/,
    );
    await assert.rejects(
      invoke("cordial", "1234567890", hash("stale")),
      /changed during account verification/,
    );
    assert.equal((await db.query("SELECT * FROM ad_accounts")).rows.length, 0);
    const first = (await invoke("cordial", "1234567890", hash("encrypted-original"))).rows[0].id;
    const second = (await invoke("cordial", "1234567890", hash("encrypted-original"))).rows[0].id;
    assert.equal(first, second);
    await assert.rejects(
      invoke("cordial", "0987654321", hash("encrypted-original")),
      /already bound/,
    );
    const state = await db.query<{ external_account_id: string; status: string; count: number }>(
      `SELECT c.external_account_id,c.status,(SELECT count(*)::int FROM ad_accounts a WHERE a.connection_id=c.id) count FROM ad_platform_connections c WHERE id=$1`,
      [connection],
    );
    assert.deepEqual(state.rows[0], {
      external_account_id: "1234567890",
      status: "connected",
      count: 1,
    });
    await db.query("UPDATE ad_platform_connections SET encrypted_access_token='new' WHERE id=$1", [
      connection,
    ]);
    await assert.rejects(
      invoke("cordial", "1234567890", hash("encrypted-original")),
      /changed during account verification/,
    );
    // If the final connection update fails, the earlier account insert rolls back.
    const failed = randomUUID();
    await db.query(
      "INSERT INTO ad_platform_connections(id,platform,imobiliaria,status,encrypted_access_token) VALUES($1,'google','morar','error','valid')",
      [failed],
    );
    await db.exec(`CREATE FUNCTION reject_binding_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.imobiliaria='morar' THEN RAISE EXCEPTION 'simulated final update failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER reject_binding BEFORE UPDATE ON ad_platform_connections FOR EACH ROW EXECUTE FUNCTION reject_binding_update();`);
    await assert.rejects(
      db.query(
        "SELECT ad_google_bind_account($1,'morar','1111111111','Account','BRL','America/Sao_Paulo',$2,null)",
        [failed, hash("valid")],
      ),
      /simulated final update failure/,
    );
    assert.equal(
      (await db.query("SELECT id FROM ad_accounts WHERE connection_id=$1", [failed])).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
