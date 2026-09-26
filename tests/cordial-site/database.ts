import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  await db.exec(
    await readFile(
      new URL("../../supabase/migrations/20260926020000_cordial_owned_site.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec("SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';");
  return db;
}
