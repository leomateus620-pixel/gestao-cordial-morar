import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
/** Historical explicit-review fixture. Current sync + retirement behavior is covered by current-sync.test.ts. */
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
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261018170000_cordial_public_experience.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261018171000_cordial_public_video_pipeline.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../../supabase/migrations/20261018172000_cordial_public_tours.sql", import.meta.url),
      "utf8",
    ),
  );
  return db;
}
