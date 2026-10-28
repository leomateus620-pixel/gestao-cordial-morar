import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createAuthorizationFixture } from "./authorization-fixture";

test("registered marketing migrations apply cumulatively in journal order", async () => {
  const folder = new URL("../../drizzle/migrations/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", folder), "utf8"));
  const migrations = readMigrationFiles({ migrationsFolder: folder.pathname });
  assert.equal(migrations.length, journal.entries.length);
  const db = await createAuthorizationFixture();
  try {
    await db.exec(
      "CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])",
    );
    // The fixture has the complete authorization migration0047; subsequent schema is additive.
    for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx >= 48)) {
      assert.equal(journal.entries[entry.idx].tag, entry.tag);
      const migration = migrations[entry.idx];
      assert.match(migration.hash, /^[a-f0-9]{64}$/);
      await db.exec("BEGIN");
      try {
        for (const statement of migration.sql) await db.exec(statement);
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    }
    const rows = await db.query<{ relname: string }>(
      "SELECT relname FROM pg_class WHERE relname IN ('marketing_reports','meta_lead_recovery_jobs','ad_metric_reconciliations','meta_insight_jobs') AND relrowsecurity",
    );
    assert.ok(rows.rows.length >= 3);
  } finally {
    await db.close();
  }
});
