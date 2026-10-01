import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const MIGRATIONS = [
  "20260926020000_cordial_owned_site.sql",
  "20260926053825_7b7296a5-cea0-449a-bf61-d560aabb468d.sql",
  // Arquivamento (01/10/2026)
  "20261001200544_ece5ff76-f639-4a29-9a44-67e2a4af7f0a.sql",
  "20261001200617_4187880b-7814-490d-8478-4fc53f3ea20d.sql",
  "20261001200745_54b946aa-6112-4f5a-a756-1f67dddf7493.sql",
];

/** Banco isolado em memória com as funções reais de arquivamento. */
export async function archiveDatabase() {
  const db = new PGlite();
  const read = (u: URL) => readFile(u, "utf8");
  await db.exec(await read(new URL("../cordial-site/schema.sql", import.meta.url)));
  await db.exec(await read(new URL("./schema.sql", import.meta.url)));
  for (const file of MIGRATIONS) {
    await db.exec(await read(new URL(`../../supabase/migrations/${file}`, import.meta.url)));
  }
  return db;
}
