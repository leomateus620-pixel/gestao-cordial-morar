import type { InspectionData } from "../../src/lib/vistoria/types";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const userId = "20000000-0000-4000-8000-000000000001",
  otherId = "20000000-0000-4000-8000-000000000002",
  id = "10000000-0000-4000-8000-000000000001",
  roomId = "40000000-0000-4000-8000-000000000001",
  itemId = "50000000-0000-4000-8000-000000000001";
export async function inspectionDatabase(through: 32 | 33 | 34 | 35 = 35) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE plpgsql STABLE AS $$ BEGIN RETURN $1=auth.uid() AND $2=coalesce(nullif(current_setting('test.role',true),''),'corretor'); END $$;
 CREATE FUNCTION public._try_uuid(text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RETURN $1::uuid;EXCEPTION WHEN OTHERS THEN RETURN NULL;END $$;
 CREATE TABLE properties(id uuid PRIMARY KEY);
 CREATE TABLE storage.objects(bucket_id text,name text);
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:2] $$;
 GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,service_role;
 GRANT SELECT ON properties,storage.objects TO authenticated;
 INSERT INTO properties VALUES('30000000-0000-4000-8000-000000000001');
 SELECT set_config('request.jwt.claim.sub','${userId}',false);`);
  for (const file of [
    "0033_vistoria_inteligente",
    "0034_vistoria_finalize_doc_name",
    "0035_vistoria_field_upgrade",
  ])
    if (Number(file.slice(0, 4)) <= through)
      await db.exec(
        await readFile(new URL(`../../drizzle/migrations/${file}.sql`, import.meta.url), "utf8"),
      );
  if (through < 33) return db;
  await db.exec(`INSERT INTO inspections(id,property_id,kind,responsible_id,created_by,property_snapshot,inspected_at,plan_confirmed) VALUES('${id}','30000000-0000-4000-8000-000000000001','entrada','${userId}','${userId}','{"search_text":"demo 1409 3408"}', '2026-10-20T12:00:00Z',true);
 INSERT INTO inspection_rooms(id,inspection_id,name,no_photo_reason) VALUES('${roomId}','${id}','Sala','Sem acesso para fotografia');
 INSERT INTO inspection_items(id,inspection_id,room_id,name,state) VALUES('${itemId}','${id}','${roomId}','Piso','bom');UPDATE inspections SET plan_confirmed=true WHERE id='${id}';`);
  return db;
}
type Snapshot = Pick<InspectionData, "inspection" | "rooms" | "items" | "media" | "notes">;
export async function snapshot(db: PGlite) {
  return (await db.query<{ snapshot: Snapshot }>(`SELECT inspection_snapshot($1) snapshot`, [id]))
    .rows[0].snapshot;
}
export const sha = "a".repeat(64),
  path = `${id}/docs/v1-${sha.slice(0, 16)}.pdf`;
export async function finalize(db: PGlite, snap: Snapshot, version = 1) {
  const object = `${id}/docs/v${version}-${sha.slice(0, 16)}.pdf`;
  await db.query(`INSERT INTO storage.objects VALUES('inspection-media',$1)`, [object]);
  return db.query(`SELECT inspection_finalize($1,$2,$3,100,$4,$5)`, [
    id,
    snap.inspection.revision,
    object,
    sha,
    snap,
  ]);
}
