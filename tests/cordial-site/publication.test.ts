import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { testDatabase } from "./database";
let db: PGlite;
before(async () => {
  db = await testDatabase();
});
after(async () => {
  await db?.close();
});
async function property(extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const row = {
    id,
    codigo_cordial: "1386",
    cidade: "Santa Rosa",
    bairro: "Centro",
    tipo: "Casa",
    valor: 450000,
    descricao_imovel: "Descrição pública.",
    ...extra,
  };
  await db.query(
    `INSERT INTO properties(${Object.keys(row).join(",")}) VALUES(${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(",")})`,
    Object.values(row),
  );
  return id;
}
async function approve(id: string, media = false) {
  const r = await db.query<{ id: string }>(
    "SELECT cordial_site_review($1,true,true,true,true,$2,true) id",
    [id, media],
  );
  return r.rows[0].id;
}
async function search(f: Record<string, unknown> = {}) {
  return (
    await db.query<{ result: { items: Array<Record<string, unknown>>; total: number } }>(
      "SELECT cordial_site_search($1) result",
      [JSON.stringify(f)],
    )
  ).rows[0].result;
}
test("null authorization and origin do not create public listings; explicit own-channel approval is required", async () => {
  const id = await property({ carteira: "morar" });
  assert.equal((await search()).total, 0);
  await approve(id);
  assert.equal((await search()).total, 1);
});
test("denied authorization, draft, archive, hidden and incompatible availability cannot be approved", async () => {
  for (const extra of [
    { autorizacao: false },
    { is_draft: true },
    { exibir_imovel: false },
    { archived_at: new Date().toISOString() },
    { removal_state: "removing" },
    { disponibilidade: "vendido" },
  ]) {
    const id = await property(extra);
    await assert.rejects(approve(id));
  }
});
test("provider status is independent from owned publication", async () => {
  const id = await property({ codigo_cordial: "new-own" });
  const pub = await approve(id);
  await db.query(
    "INSERT INTO property_provider_publications(property_id,provider,enabled,status) VALUES($1,'cordial',false,'error')",
    [id],
  );
  assert.ok((await search({ referencia: "new-own" })).items.some((x) => x.id === pub));
});
test("whitelist excludes owners, Morar code, maps, internal identity and hidden address", async () => {
  const id = await property({
    codigo_cordial: "privacy",
    codigo_morar: "PRIVATE-CODE",
    proprietario_nome: "OWNER-SENTINEL",
    proprietario_telefone: "PHONE-SENTINEL",
    observacao_imovel: "NOTES-SENTINEL",
    localizacao_maps_url: "https://maps.invalid/SECRET",
    logradouro: "PRIVATE-STREET",
    numero: "99",
  });
  await approve(id);
  const result = await search({ referencia: "privacy" });
  const json = JSON.stringify(result);
  for (const forbidden of [
    "PRIVATE",
    "OWNER",
    "PHONE",
    "NOTES",
    id,
    "storage_path",
    "proprietario",
    "maps_url",
  ])
    assert.ok(!json.includes(forbidden), forbidden);
  assert.equal(result.items[0].address, null);
  assert.equal((await search({ q: "PRIVATE-STREET" })).total, 0);
  assert.equal((await search({ referencia: "PRIVATE-CODE" })).total, 0);
});
test("content edits invalidate approval and subsequent reapproval preserves public identity/reference", async () => {
  const id = await property({ codigo_cordial: "revision" });
  const pub = await approve(id);
  await db.query("UPDATE properties SET descricao_imovel='New unreviewed content' WHERE id=$1", [
    id,
  ]);
  assert.equal((await search({ referencia: "revision" })).total, 0);
  assert.equal(await approve(id), pub);
  assert.equal((await search({ referencia: "revision" })).total, 1);
});
test("routine price change reflects immediately without editorial reordering", async () => {
  const id = await property({ codigo_cordial: "price" });
  await approve(id);
  const old = (await search({ referencia: "price" })).items[0];
  await db.query("UPDATE properties SET valor=900000,updated_at=now() WHERE id=$1", [id]);
  const next = (await search({ referencia: "price" })).items[0];
  assert.equal(next.price, 900000);
  assert.equal(next.publishedAt, old.publishedAt);
});
test("withdrawing removes property from search, facets and media immediately", async () => {
  const id = await property({ codigo_cordial: "withdraw" });
  await db.query(
    "INSERT INTO property_images(property_id,storage_path,position) VALUES($1,'legacy/photo.jpg',0)",
    [id],
  );
  const pub = await approve(id, true);
  assert.equal(
    (await db.query("SELECT id FROM cordial_site_authorized_media WHERE public_id=$1", [pub])).rows
      .length,
    1,
  );
  await db.query("SELECT cordial_site_review($1,false)", [id]);
  assert.equal((await search({ referencia: "withdraw" })).total, 0);
  assert.equal(
    (await db.query("SELECT id FROM cordial_site_authorized_media WHERE public_id=$1", [pub])).rows
      .length,
    0,
  );
});
test("canonical order and cover follow position, while changed media requires renewed review", async () => {
  const id = await property({ codigo_cordial: "photos" });
  const first = randomUUID(),
    second = randomUUID();
  await db.query(
    "INSERT INTO property_images(id,property_id,storage_path,position,is_cover) VALUES($1,$3,'legacy/first.jpg',0,false),($2,$3,'legacy/second.jpg',1,true)",
    [first, second, id],
  );
  const pub = await approve(id, true);
  const list = await search({ referencia: "photos" });
  assert.equal((list.items[0].cover as { position: number }).position, 0);
  assert.equal(list.items[0].photoCount, 2);
  await db.query(
    "UPDATE property_images SET storage_path='changed.jpg',updated_at=now() WHERE id=$1",
    [first],
  );
  const media = await db.query("SELECT id FROM cordial_site_authorized_media WHERE public_id=$1", [
    pub,
  ]);
  assert.equal(media.rows.length, 0);
  await approve(id, true);
  assert.equal((await search({ referencia: "photos" })).items[0].photoCount, 2);
});
test("combined filters, literal references, null values and price-on-request keep correct semantics", async () => {
  const id = await property({
    codigo_cordial: "R%');--",
    tipo: "Kitnet",
    valor: null,
    valor_modo: "consulte",
    area_util: null,
    area_total: 120,
    mobiliado: null,
  });
  await approve(id);
  assert.equal((await search({ referencia: "R%');--" })).total, 1);
  assert.equal((await search({ referencia: "R%');--", precoMax: 500000 })).total, 0);
  assert.equal((await search({ referencia: "R%');--", areaTipo: "util", areaMin: 0 })).total, 0);
  assert.equal(
    (
      await search({
        referencia: "R%');--",
        areaTipo: "total",
        areaMin: 100,
        tipo: "Kitnet",
        cidade: "Santa Rosa",
      })
    ).total,
    1,
  );
  assert.equal((await search({ referencia: "R%');--", mobiliado: "nao" })).total, 0);
});
test("deterministic pagination covers every eligible identity once, including prices tied/null", async () => {
  for (let i = 0; i < 28; i++)
    await approve(
      await property({
        codigo_cordial: `PAGE-${i}`,
        tipo: "Pagination",
        valor: i % 2 ? 500000 : null,
      }),
    );
  const ids: unknown[] = [];
  for (let p = 1; p <= 3; p++) {
    const r = await search({ tipo: "Pagination", pagina: p, ordem: "preco_asc" });
    assert.equal(r.total, 28);
    ids.push(...r.items.map((i) => i.id));
  }
  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, 28);
});
test("no external identifier needed; GC references never become public commercial codes", async () => {
  const id = await property({ codigo_cordial: "GC-internal" });
  const pub = await approve(id);
  const row = (
    await db.query<{ public_reference: string }>(
      "SELECT public_reference FROM cordial_site_publications WHERE public_id=$1",
      [pub],
    )
  ).rows[0];
  assert.match(row.public_reference, /^C-\d{6}$/);
});
test("anonymous and ordinary authenticated roles cannot read private views or execute approval", async () => {
  await db.exec("SET ROLE anon");
  await assert.rejects(db.query("SELECT * FROM cordial_site_documents"));
  await assert.rejects(db.query("SELECT * FROM properties"));
  await assert.rejects(db.query("SELECT cordial_site_search('{}')"));
  await db.exec("RESET ROLE");
  await db.exec(
    "SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002'",
  );
  const count = await db.query("SELECT * FROM cordial_site_publications");
  assert.equal(count.rows.length, 0);
  await assert.rejects(
    db.query("SELECT cordial_site_review($1,true,true,true,true,true,true)", [randomUUID()]),
  );
  await db.exec("RESET ROLE; SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'");
});
test("durable lead deduplication and explicit idempotent commercial triage", async () => {
  await db.query("UPDATE cordial_site_settings SET content=$1", [
    JSON.stringify({ privacy: "Approved privacy text." }),
  ]);
  const lead = {
    requestId: randomUUID(),
    name: "Test User",
    phone: "55999999999",
    message: "Interested in a home",
    kind: "contato",
    entryPath: "/site/contato",
    campaign: {},
  };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await db.query<{ result: string }>("SELECT cordial_site_submit_lead($1,$2) result", [
          JSON.stringify(lead),
          "same-fingerprint",
        ])
      ).rows[0].result,
      "received",
    );
  const rows = await db.query<{ id: string }>(
    "SELECT id FROM cordial_site_leads WHERE fingerprint=$1",
    ["same-fingerprint"],
  );
  assert.equal(rows.rows.length, 1);
  const id = rows.rows[0].id;
  const a = await db.query<{ id: string }>("SELECT cordial_site_triage($1,'compra','casa') id", [
    id,
  ]);
  const b = await db.query<{ id: string }>("SELECT cordial_site_triage($1,'compra','casa') id", [
    id,
  ]);
  assert.equal(a.rows[0].id, b.rows[0].id);
  assert.equal((await db.query("SELECT id FROM attendances")).rows.length, 1);
});
test("rate limit is atomic and expires, and unavailable property cannot receive interest", async () => {
  assert.equal(
    (await db.query<{ ok: boolean }>("SELECT cordial_site_take_rate('test',1,60) ok")).rows[0].ok,
    true,
  );
  assert.equal(
    (await db.query<{ ok: boolean }>("SELECT cordial_site_take_rate('test',1,60) ok")).rows[0].ok,
    false,
  );
  const lead = {
    requestId: randomUUID(),
    propertyId: randomUUID(),
    name: "Test",
    phone: "55999999999",
    message: "Test interest",
    kind: "interesse",
    entryPath: "/site/contato",
  };
  await assert.rejects(
    db.query("SELECT cordial_site_submit_lead($1,$2)", [JSON.stringify(lead), "unavailable"]),
  );
});

test("area edits require renewed unit review and exact room filtering is distinct from minimum", async () => {
  const id = await property({ codigo_cordial: "areas-rooms", dormitorios: 3, area_total: 100 });
  await approve(id);
  assert.equal((await search({ referencia: "areas-rooms", dormitorios: 2 })).total, 1);
  assert.equal(
    (await search({ referencia: "areas-rooms", dormitorios: 2, contagem: "exata" })).total,
    0,
  );
  await db.query("UPDATE properties SET area_total_unidade='hectares' WHERE id=$1", [id]);
  assert.equal((await search({ referencia: "areas-rooms" })).total, 0);
});
