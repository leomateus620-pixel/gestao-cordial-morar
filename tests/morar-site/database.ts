import { readFile } from "node:fs/promises";
import { archiveDatabase } from "../archive/database";

/** Current Cordial sync/retirement chain + canonical Drizzle Morar migration, never a remote database. */
export async function morarDatabase() {
  const db = await archiveDatabase({ currentSync: false });
  await db.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  await db.exec(
    await readFile(
      new URL("../../drizzle/migrations/0002_morar_owned_site.sql", import.meta.url),
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
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261018173000_cordial_sync_trigger_record_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}
