import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { morarDatabase } from "../morar-site/database";

let db: PGlite;
before(async () => {
  db = await morarDatabase();
  for (const name of [
    "0064_cordial_site_showcase",
    "0066_morar_site_showcase",
    "0093_bound_public_showcase_lookup",
  ]) {
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
  }
});
after(() => db?.close());

for (const brand of ["cordial", "morar"] as const) {
  test(`${brand} showcase exposes only the active week's authorized photo`, async () => {
    const ns = `${brand}_site`;
    const read = async () => (await db.query(`SELECT * FROM ${ns}_showcase_active()`)).rows;
    const propertyId = randomUUID();
    const checksum = "a".repeat(32);
    assert.deepEqual(await read(), []);

    await db.query(
      "INSERT INTO properties(id,carteira,codigo_cordial,codigo_morar,operacao,tipo) VALUES($1::uuid,$2,$1::uuid::text,$1::uuid::text,'venda','Casa')",
      [propertyId, brand],
    );
    await db.query(
      "INSERT INTO property_images(property_id,storage_path,position) VALUES($1,'qa/showcase.jpg',0)",
      [propertyId],
    );
    const publicId = (
      await db.query<{ id: string }>(`SELECT ${ns}_review($1,true,true,true,true,true,true) id`, [
        propertyId,
      ])
    ).rows[0].id;
    const media = (
      await db.query<{ id: string; version: string }>(
        `SELECT id,version FROM ${ns}_authorized_media WHERE public_id=$1`,
        [publicId],
      )
    ).rows[0];
    assert.ok(media);
    const weekId = (
      await db.query<{ id: string }>(
        `INSERT INTO ${ns}_showcase_weeks(week_start,property_id,public_id,media_id,media_version,state,storage_path,checksum,width,height,focal_x,focal_y)
         VALUES('2050-01-03',$1,$2,$3,$4,'pronto','qa/edited.jpg',$5,1536,1024,0.4,0.6) RETURNING id`,
        [propertyId, publicId, media.id, media.version, checksum],
      )
    ).rows[0].id;
    assert.deepEqual(await read(), []);

    await db.query(`SELECT ${ns}_showcase_activate($1,false)`, [weekId]);
    assert.equal((await read())[0]?.edited, false, "an unapproved edit serves the original");
    await db.query(`UPDATE ${ns}_showcase_weeks SET approved_at=now() WHERE id=$1`, [weekId]);
    await db.query(`SELECT ${ns}_showcase_activate($1,false)`, [weekId]);
    assert.deepEqual(await read(), [
      {
        week_id: weekId,
        public_id: publicId,
        media_id: media.id,
        media_version: media.version,
        edited: true,
        checksum,
        storage_path: "qa/edited.jpg",
        width: 1536,
        height: 1024,
        focal_x: "0.4",
        focal_y: "0.6",
      },
    ]);
    const other = brand === "cordial" ? "morar" : "cordial";
    assert.deepEqual((await db.query(`SELECT * FROM ${other}_site_showcase_active()`)).rows, []);

    await db.query(`UPDATE ${ns}_showcase_weeks SET media_version=$2 WHERE id=$1`, [
      weekId,
      "b".repeat(32),
    ]);
    assert.deepEqual(await read(), [], "a stale media version is never served");
    await db.query(`UPDATE ${ns}_showcase_weeks SET media_version=$2 WHERE id=$1`, [
      weekId,
      media.version,
    ]);
    await db.query(`SELECT ${ns}_review($1,false)`, [propertyId]);
    assert.deepEqual(await read(), [], "withdrawing the property removes its active image");
    await db.query(`UPDATE ${ns}_showcase_weeks SET state='encerrado' WHERE id=$1`, [weekId]);

    const grants = (
      await db.query(
        `SELECT has_function_privilege('anon','public.${ns}_showcase_active()','EXECUTE') AS anon,
              has_function_privilege('authenticated','public.${ns}_showcase_active()','EXECUTE') AS authenticated,
              has_function_privilege('service_role','public.${ns}_showcase_active()','EXECUTE') AS service_role`,
      )
    ).rows[0];
    assert.deepEqual(grants, { anon: false, authenticated: false, service_role: true });
  });
}
