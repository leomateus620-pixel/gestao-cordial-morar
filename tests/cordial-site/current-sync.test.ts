import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { morarDatabase } from "../morar-site/database";

// This fixture applies the actual 26/09 Cordial synchronization, all three 01/10
// retirement migrations, canonical Drizzle0002 Morar, and the new experience migrations.
let db: PGlite;
before(async () => {
  db = await morarDatabase();
});
after(async () => {
  await db?.close();
});
async function providerListing() {
  const id = randomUUID(),
    image = randomUUID();
  await db.query(
    "INSERT INTO properties(id,carteira,codigo_cordial,operacao,tipo,cidade,bairro,descricao_imovel,logradouro,numero,exibir_endereco_site,valor) VALUES($1,'cordial',$2,'venda','Casa','Sync QA','Centro','Casa com jardim.','Rua Interna Privada','10','sim',123)",
    [id, randomUUID()],
  );
  await db.query(
    "INSERT INTO property_images(id,property_id,storage_path,position,width,height) VALUES($1,$2,'controlled/sync.jpg',0,2000,1000)",
    [image, id],
  );
  await db.query(
    "INSERT INTO property_provider_publications(property_id,provider,enabled,status,desired_availability) VALUES($1,'cordial',true,'published','visible')",
    [id],
  );
  const row = (
    await db.query<{ id: string; reference: string }>(
      "SELECT public_id id,public_reference reference FROM cordial_site_publications WHERE property_id=$1",
      [id],
    )
  ).rows[0];
  return { property: id, image, ...row };
}
test("current provider synchronization keeps public identity while new projection blocks internal location", async () => {
  const listing = await providerListing();
  const before = (
    await db.query<{ document: { id: string; address: unknown; price: number } }>(
      "SELECT document FROM cordial_site_documents WHERE public_id=$1",
      [listing.id],
    )
  ).rows[0].document;
  assert.equal(before.id, listing.id);
  assert.equal(before.address, null);
  assert.equal(before.price, 123);
  assert.equal(
    (
      await db.query("SELECT * FROM morar_site_publications WHERE property_id=$1", [
        listing.property,
      ])
    ).rows.length,
    0,
  );
  await db.query(
    "UPDATE properties SET descricao_imovel='Descrição canônica atualizada.',valor=321 WHERE id=$1",
    [listing.property],
  );
  const publication = (
    await db.query<{ current: boolean; state: string }>(
      "SELECT s.reviewed_content_hash=cordial_site_content_hash(p) current,s.state FROM cordial_site_publications s JOIN properties p ON p.id=s.property_id WHERE p.id=$1",
      [listing.property],
    )
  ).rows[0];
  assert.equal(
    publication.current,
    true,
    "property update trigger must reconcile the reviewed canonical version",
  );
  const after = (
    await db.query<{
      document: { id: string; reference: string; price: number; description: string };
    }>("SELECT document FROM cordial_site_documents WHERE public_id=$1", [listing.id])
  ).rows[0].document;
  assert.equal(after.id, listing.id);
  assert.equal(after.reference, listing.reference);
  assert.equal(after.price, 321);
  assert.equal(after.description, "Descrição canônica atualizada.");
});
test("current image sync changes authorized version and cannot revive an old derivative or tour", async () => {
  const listing = await providerListing();
  const media = (
    await db.query<{ id: string; version: string }>(
      "SELECT id,version FROM cordial_site_authorized_media WHERE public_id=$1",
      [listing.id],
    )
  ).rows[0];
  await db.query("SELECT cordial_site_save_tour($1,$2,true,true,1920,960)", [
    media.id,
    media.version,
  ]);
  const key = `cordial/${media.id}/${media.version}/960-jpeg-q80-purejs-v2.jpg`;
  const lease = (
    await db.query<{ lease: string }>("SELECT public_site_claim_derivative($1) lease", [key])
  ).rows[0].lease;
  await db.query("SELECT public_site_finish_derivative($1,$2,$3)", [key, lease, "a".repeat(64)]);
  await db.query("UPDATE property_images SET content_hash='revised-source' WHERE id=$1", [
    listing.image,
  ]);
  const updated = (
    await db.query<{ id: string; version: string }>(
      "SELECT id,version FROM cordial_site_authorized_media WHERE public_id=$1",
      [listing.id],
    )
  ).rows[0];
  assert.equal(updated.id, media.id);
  assert.notEqual(updated.version, media.version);
  assert.equal(
    (
      await db.query("SELECT * FROM cordial_site_authorized_media WHERE id=$1 AND version=$2", [
        media.id,
        media.version,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM public_site_derivatives WHERE key=$1 AND state='ready'", [key]))
      .rows.length,
    1,
    "private old bytes can remain stored but are no longer authorized",
  );
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_tours WHERE public_id=$1", [listing.id]))
      .rows.length,
    0,
  );
});
test("current reconciliation respects manual withdrawal after property and provider updates", async () => {
  const listing = await providerListing();
  await db.query("SELECT cordial_site_review($1,false)", [listing.property]);
  await db.query("UPDATE properties SET valor=999 WHERE id=$1", [listing.property]);
  await db.query(
    "UPDATE property_provider_publications SET status='out_of_sync' WHERE property_id=$1 AND provider='cordial'",
    [listing.property],
  );
  await db.query("SELECT cordial_site_sync_property($1)", [listing.property]);
  const state = (
    await db.query<{ state: string }>(
      "SELECT state FROM cordial_site_publications WHERE public_id=$1",
      [listing.id],
    )
  ).rows[0].state;
  assert.equal(state, "withdrawn");
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_documents WHERE public_id=$1", [listing.id])).rows
      .length,
    0,
  );
});
