import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { morarDatabase } from "./database";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("reservations place recovered photos without moving existing photos and both sites use the saved cover", async () => {
  const db = await morarDatabase();
  try {
    await db.exec(`
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      CREATE FUNCTION is_meta_reviewer() RETURNS boolean LANGUAGE sql STABLE AS
        $$ SELECT current_setting('fixture.actor', true) IS NOT DISTINCT FROM 'meta' $$;
      CREATE FUNCTION is_atendimentos_viewer() RETURNS boolean LANGUAGE sql STABLE AS
        $$ SELECT current_setting('fixture.actor', true) IS NOT DISTINCT FROM 'attendance' $$;
      CREATE TABLE property_image_batches (id uuid PRIMARY KEY, property_id uuid);
      ALTER TABLE properties ADD COLUMN gallery_revision integer NOT NULL DEFAULT 1;
      ALTER TABLE property_images ADD COLUMN created_at timestamptz DEFAULT now(),
        ADD COLUMN original_checksum text, ADD COLUMN file_name text, ADD COLUMN mime_type text,
        ADD COLUMN size_bytes bigint, ADD COLUMN upload_status text, ADD COLUMN uploaded_by uuid,
        ADD COLUMN batch_id uuid, ADD COLUMN processed_at timestamptz;
      GRANT SELECT, UPDATE ON properties, property_images TO authenticated;
    `);
    await db.exec(
      await source("supabase/migrations/20260922194327_bfec8882-5d9a-4816-883c-82284bf4ef4a.sql"),
    );
    const reservations = await source(
      "supabase/migrations/20260923061000_imobi_upload_reservations.sql",
    );
    // Use the existing reservation, finalization and append RPCs with no external Storage.
    await db.exec(
      reservations.split(
        "CREATE OR REPLACE FUNCTION public.property_image_upload_mark_missing",
      )[0]!,
    );
    await db.exec(
      reservations.slice(
        reservations.indexOf("CREATE OR REPLACE FUNCTION public.property_image_register"),
        reservations.indexOf("CREATE OR REPLACE FUNCTION public.property_image_batch_bump"),
      ),
    );
    const dependencies = await source(
      "supabase/migrations/20260917183640_9c5c5e1d-bb98-4b8d-9c6d-464f03b96fe9.sql",
    );
    await db.exec(
      dependencies.slice(
        dependencies.indexOf(
          "CREATE OR REPLACE FUNCTION public.property_images_bump_gallery_revision",
        ),
        dependencies.indexOf(
          "FOR EACH ROW EXECUTE FUNCTION public.property_images_bump_gallery_revision();",
        ) + "FOR EACH ROW EXECUTE FUNCTION public.property_images_bump_gallery_revision();".length,
      ),
    );
    await db.exec(await source("drizzle/migrations/0110_property_gallery_upload_order.sql"));

    const property = randomUUID();
    await db.query(
      `
      INSERT INTO properties(id,carteira,source,codigo_cordial,codigo_morar,cidade,bairro,tipo,valor,disponibilidade,autorizacao)
      VALUES($1,'cordial','imobibrasil','C-QA','M-QA','Santa Rosa','Centro','Casa',123,'sim',true)
    `,
      [property],
    );
    const first = randomUUID();
    const second = randomUUID();
    const recovery = randomUUID();
    const duplicate = randomUUID();
    const broken = randomUUID();

    const edit = (ids: string[], keys: string[], revision?: number) =>
      db.query<{ revision: number }>(
        `
      SELECT property_gallery_save_order($1,$2,$3,coalesce($4,(SELECT gallery_revision FROM properties WHERE id=$1))) revision
    `,
        [property, ids, keys, revision ?? null],
      );
    const reserve = async (key: string, code: string) => {
      const path = `${property}/originais/galeria-${key}-${randomUUID()}-${code}.jpg`;
      const { rows } = await db.query<{ id: string }>(
        "SELECT property_image_upload_reserve($1,$2,$3,'image/jpeg',100,$4) id",
        [property, path, `${code}.jpg`, code.repeat(64)],
      );
      return rows[0]!.id;
    };
    const finish = async (id: string) => {
      const { rows } = await db.query<{ result: { status: string; imageId: string } }>(
        "SELECT property_image_upload_finalize($1) result",
        [id],
      );
      return rows[0]!.result;
    };
    const photos = () =>
      db
        .query<{
          id: string;
          cover: boolean;
          position: number;
        }>(
          "SELECT id, is_cover cover, position FROM property_images WHERE property_id=$1 AND NOT pending_remote_delete ORDER BY position",
          [property],
        )
        .then(({ rows }) => rows);

    await db.exec("SET ROLE authenticated; SET request.jwt.claim.role='authenticated'");
    const saved = await edit([], [first, second, recovery, duplicate, broken]);
    const firstReservation = await reserve(first, "a");
    const secondReservation = await reserve(second, "b");
    const recoveredReservation = await reserve(recovery, "c");
    const duplicateReservation = await reserve(duplicate, "a");
    await db.exec("RESET ROLE; SET request.jwt.claim.role='service_role'");

    const b = (await finish(secondReservation)).imageId;
    await assert.rejects(
      edit([b], [first, second, recovery, duplicate, broken], saved.rows[0]!.revision),
      /galeria_desatualizada/,
    );
    const a = (await finish(firstReservation)).imageId;
    assert.deepEqual(
      (await photos()).map(({ id }) => id),
      [a, b],
    );
    assert.equal((await finish(duplicateReservation)).status, "duplicated");
    await edit([b, a], [second, recovery, first]); // Removido o slot com falha antes do PUT.
    assert.deepEqual(await photos(), [
      { id: b, cover: true, position: 0 },
      { id: a, cover: false, position: 1 },
    ]);

    // A confirmação tardia usa a reserva existente sem nenhuma chamada do navegador.
    const c = (await finish(recoveredReservation)).imageId;
    assert.deepEqual(await photos(), [
      { id: b, cover: true, position: 0 },
      { id: c, cover: false, position: 1 },
      { id: a, cover: false, position: 2 },
    ]);
    assert.equal(
      (
        await db.query("SELECT * FROM property_gallery_upload_order WHERE property_id=$1", [
          property,
        ])
      ).rows.length,
      0,
    );

    await db.query(
      `INSERT INTO property_provider_publications(property_id,provider,enabled,status,desired_availability)
      VALUES($1,'cordial',true,'published','visible'),($1,'morar',true,'published','visible')`,
      [property],
    );
    await db.query("SELECT morar_site_request_publication($1,$2,true,NULL,true,false)", [
      property,
      ADMIN,
    ]);
    await db.query(
      `UPDATE property_images SET processing_status='ready',watermark_variant='morar-cordial',
      destination_hash=desired_destination_hash,
      processed_storage_path=property_id::text||'/marcadas/'||id::text||'.jpg' WHERE property_id=$1`,
      [property],
    );
    for (const brand of ["cordial", "morar"]) {
      const table = `${brand}_site_authorized_media`;
      const media = await db.query<{ id: string; source: string; position: number }>(
        `
        SELECT id, storage_path source, position FROM ${table} WHERE property_id=$1 ORDER BY position
      `,
        [property],
      );
      assert.deepEqual(
        media.rows.map(({ source }) => source.split("/").at(-1)),
        [b, c, a].map((id) => `${id}.jpg`),
        brand,
      );
      const cover = await db.query<{ cover: string }>(
        `
        SELECT document->'cover'->>'id' cover FROM ${brand}_site_documents WHERE property_id=$1
      `,
        [property],
      );
      assert.equal(cover.rows[0]?.cover, media.rows[0]?.id, brand);
    }

    await edit([b, c, a], [second, recovery, first, randomUUID()]);
    await db.exec("SET ROLE authenticated; SET request.jwt.claim.role='authenticated'");
    for (const actor of ["meta", "attendance"]) {
      await db.query("SELECT set_config('fixture.actor',$1,false)", [actor]);
      assert.equal((await db.query("SELECT * FROM property_gallery_upload_order")).rows.length, 0);
      await assert.rejects(edit([b, a, c], [second, first, recovery]), /sem_permissao/);
    }
  } finally {
    await db.close();
  }
});
