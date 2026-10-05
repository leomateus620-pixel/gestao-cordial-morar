import { readFile } from "node:fs/promises";
import { archiveDatabase } from "../archive/database";

/** Current Cordial/retirement functions + additive Morar migration, never a remote database. */
export async function morarDatabase() {
  const db = await archiveDatabase();
  await db.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  await db.exec(
    await readFile(
      new URL("./morar_owned_site.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec("SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';");
  return db;
}
