import { before, after, test } from "node:test";
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
    "0094_weekly_featured_photo_treatment",
  ])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
});
after(() => db?.close());
for (const brand of ["cordial", "morar"])
  test(`${brand}: only complete, authorized treatments activate atomically and survive neither withdrawal nor source changes`, async () => {
    const ns = `${brand}_site`,
      property = randomUUID();
    await db.query(
      `INSERT INTO properties(id,carteira,codigo_cordial,codigo_morar,operacao,tipo) VALUES($1,$2,$1::uuid::text,$1::uuid::text,'venda','Casa')`,
      [property, brand],
    );
    for (let i = 0; i < 3; i++)
      await db.query(
        "INSERT INTO property_images(property_id,storage_path,position,is_cover) VALUES($1,$2,$3,$4)",
        [property, `qa/${brand}-${i}.jpg`, i, i === 0],
      );
    const publicId = (
      await db.query<{ id: string }>(`SELECT ${ns}_review($1,true,true,true,true,true,true) id`, [
        property,
      ])
    ).rows[0].id;
    const photos = (
      await db.query<{ id: string; version: string; position: number }>(
        `SELECT id,version,position FROM ${ns}_authorized_media WHERE public_id=$1 ORDER BY position,id`,
        [publicId],
      )
    ).rows.map((p, ordinal) => ({ ...p, ordinal }));
    const items = [{ slot: 1, publicId, photos }],
      plan = async (date: string, selection = items) =>
        (
          await db.query<{ id: string }>(`SELECT ${ns}_featured_plan($1,$2::jsonb) id`, [
            date,
            JSON.stringify(selection),
          ])
        ).rows[0].id;
    await assert.rejects(plan("2026-11-09"), /not been authorized/);
    await db.query(`UPDATE ${ns}_showcase_settings SET featured_policy=$1::jsonb WHERE id`, [
      JSON.stringify({
        enabled: true,
        treatment: "faithful-tone-v1",
        authorizedAt: "2026-11-14T12:00:00Z",
        authorizedBy: null,
        authorization: "Explicit faithful photometric treatment.",
      }),
    ]);
    await assert.rejects(
      plan("2026-11-09", [{ ...items[0], photos: photos.slice(0, 1) }]),
      /current cover and first photos/,
    );
    const week = await plan("2026-11-09");
    assert.equal(await plan("2026-11-09"), week);
    const activate = async (id: string) =>
      (await db.query<{ ok: boolean }>(`SELECT ${ns}_featured_activate($1) ok`, [id])).rows[0].ok;
    assert.equal(await activate(week), false);
    const first = (
      await db.query<{ id: string }>(`SELECT id FROM ${ns}_featured_claim($1,$2)`, [
        week,
        randomUUID(),
      ])
    ).rows[0];
    const second = (
      await db.query<{ id: string }>(`SELECT id FROM ${ns}_featured_claim($1,$2)`, [
        week,
        randomUUID(),
      ])
    ).rows[0];
    assert.notEqual(first.id, second.id, "leases never hand out the same photo");
    const ready = async (id: string) =>
      db.query(
        `UPDATE ${ns}_featured_photos p SET state='ready',treatment_version='faithful-tone-v1',checksum=$2,storage_prefix='featured/'||$1||'/'||p.id||'/'||$2,parameters='{}',variants='{"thumb":{},"card":{},"full":{}}',width=960,height=640,prepared_at=now() FROM ${ns}_featured_items i WHERE i.id=p.item_id AND i.week_id=$1::uuid`,
        [id, "a".repeat(64)],
      );
    await ready(week);
    assert.equal(await activate(week), true);
    assert.equal(await activate(week), true);
    assert.equal((await db.query(`SELECT * FROM ${ns}_featured_active()`)).rows.length, 3);
    const future = await plan("2026-11-16");
    assert.equal(await activate(future), false);
    assert.equal(
      (await db.query(`SELECT id FROM ${ns}_featured_weeks WHERE state='active'`)).rows[0].id,
      week,
    );
    await ready(future);
    assert.equal(await activate(future), true);
    assert.equal(
      (await db.query(`SELECT id FROM ${ns}_featured_weeks WHERE state='active'`)).rows[0].id,
      future,
    );
    assert.equal(await activate(week), false, "an ended week cannot supersede the new week");
    await db.query(
      `UPDATE ${ns}_featured_photos SET media_version=$1 WHERE id=(SELECT p.id FROM ${ns}_featured_photos p JOIN ${ns}_featured_items i ON p.item_id=i.id WHERE i.week_id=$2 LIMIT 1)`,
      ["b".repeat(32), future],
    );
    assert.equal((await db.query(`SELECT * FROM ${ns}_featured_active()`)).rows.length, 2);
    await db.query("UPDATE properties SET archived_at=now() WHERE id=$1", [property]);
    assert.equal((await db.query(`SELECT * FROM ${ns}_featured_active()`)).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM ${ns}_featured_authorized_photos`)).rows.length, 0);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            `SELECT has_function_privilege($1,'${ns}_featured_activate(uuid)','execute') ok`,
            [role],
          )
        ).rows[0].ok,
        false,
      );
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            `SELECT has_table_privilege($1,'${ns}_featured_photos','update') ok`,
            [role],
          )
        ).rows[0].ok,
        false,
      );
    }
    const policies = (
      await db.query<{ polname: string }>(
        `SELECT polname FROM pg_policy WHERE polrelid='${ns}_featured_photos'::regclass AND NOT polpermissive`,
      )
    ).rows;
    assert.deepEqual(policies.map((p) => p.polname).sort(), [
      "atendimentos_viewer_block",
      "meta_reviewer_block",
    ]);
  });
