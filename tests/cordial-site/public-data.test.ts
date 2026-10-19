import { test, before, after } from "node:test";
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
async function published(extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const row = {
    id,
    tipo: "Casa",
    cidade: "QA",
    bairro: "Centro",
    codigo_cordial: randomUUID(),
    valor: 100,
    dormitorios: 2,
    area_construida: 80,
    ...extra,
  };
  await db.query(
    `INSERT INTO properties(${Object.keys(row)}) VALUES(${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(",")})`,
    Object.values(row),
  );
  return (
    await db.query<{ id: string }>(
      "SELECT cordial_site_review($1,true,true,true,true,false,true) id",
      [id],
    )
  ).rows[0].id;
}
test("Cordial withholds exact address and known street in prose even when cadastro allows it", async () => {
  const id = await published({
    exibir_endereco_site: "sim",
    logradouro: "Rua Privada Sensível",
    numero: "317",
    descricao_imovel: "Na Rua Privada Sensível, 317.",
    caracteristicas: ["Jardim", "Rua Privada Sensível"],
  });
  const document = (
    await db.query<{ document: Record<string, unknown> }>(
      "SELECT document FROM cordial_site_documents WHERE public_id=$1",
      [id],
    )
  ).rows[0].document;
  assert.equal(document.address, null);
  assert.equal(document.description, "");
  assert.deepEqual(document.features, ["Jardim"]);
  assert.ok(!JSON.stringify(document).includes("Privada"));
});
test("count, facets and paged items share filters, null/zero semantics and withdrawal", async () => {
  await published({ bairro: "Central", operacao: "aluguel", valor: 0, dormitorios: 0 });
  await published({ bairro: "Centro", operacao: "aluguel", valor: null, valor_modo: "consulte" });
  await published({ bairro: "Centro", operacao: "aluguel", valor: 2500, dormitorios: 2 });
  for (const f of [
    { cidade: "QA" },
    { cidade: "QA", bairro: "Central" },
    { cidade: "QA", precoMin: 0, precoMax: 0 },
    { cidade: "QA", valorModo: "consulte" },
    { cidade: "QA", dormitorios: 0, contagem: "exata" },
    { cidade: "QA", fotos: "sim" },
    { cidade: "QA", finalidade: "aluguel", areaMin: 75, areaTipo: "construida" },
  ]) {
    const result = (
      await db.query<{
        catalog: { total: number; items: Array<unknown> };
        total: number;
        facets: { total: number };
      }>(
        "SELECT cordial_site_search($1) catalog,cordial_site_count($1)::int total,cordial_site_filtered_facets($1) facets",
        [JSON.stringify(f)],
      )
    ).rows[0];
    assert.equal(result.total, result.catalog.total);
    assert.equal(result.facets.total, result.total);
    assert.equal(result.catalog.items.length, result.total);
  }
  const central = (
    await db.query<{ facets: { districts: Array<{ value: string; count: number }> } }>(
      `SELECT cordial_site_filtered_facets('{"cidade":"QA","bairro":"Central"}') facets`,
    )
  ).rows[0].facets;
  assert.deepEqual(central.districts, [{ value: "Central", city: "QA", count: 1 }]);
  const id = await published({ cidade: "Retirada" });
  await db.query("UPDATE cordial_site_publications SET state='withdrawn' WHERE public_id=$1", [id]);
  assert.equal(
    (await db.query<{ n: number }>(`SELECT cordial_site_count('{"cidade":"Retirada"}')::int n`))
      .rows[0].n,
    0,
  );
});
test("responsible is explicit commercial publication and falls back to configured team", async () => {
  const person = "00000000-0000-4000-8000-000000000001";
  const id = await published({
    corretor_id: person,
    proprietario_nome: "Owner private",
    proprietario_telefone: "55998888888",
  });
  const read = async () =>
    (
      await db.query<{ r: Record<string, unknown> | null }>(
        "SELECT document->'responsible' r FROM cordial_site_documents WHERE public_id=$1",
        [id],
      )
    ).rows[0].r;
  assert.equal(await read(), null);
  await db.query(
    `UPDATE cordial_site_settings SET content=content||'{"whatsapp":"5555999999999"}'`,
  );
  assert.equal((await read())?.kind, "team");
  await db.query(
    "SELECT cordial_site_save_responsible($1,'Pessoa publicada','Corretor','5555888888888','',true)",
    [person],
  );
  assert.deepEqual(await read(), {
    kind: "person",
    name: "Pessoa publicada",
    role: "Corretor",
    whatsapp: "5555888888888",
    photoUrl: null,
  });
  await db.query("UPDATE cordial_site_responsibles SET active=false WHERE profile_id=$1", [person]);
  assert.equal((await read())?.kind, "team");
  await db.exec("SET ROLE anon");
  await assert.rejects(db.query("SELECT * FROM cordial_site_responsibles"));
  await assert.rejects(db.query("SELECT cordial_site_public_responsible($1)", [person]));
  await db.exec("RESET ROLE");
});
test("derivative durable lease deduplicates jobs, rejects stale finish and stays service-only", async () => {
  const key = `cordial/${randomUUID()}/${"a".repeat(32)}/960-jpeg-q80-purejs-v2.jpg`;
  const lease = (
    await db.query<{ lease: string }>("SELECT public_site_claim_derivative($1) lease", [key])
  ).rows[0].lease;
  assert.ok(lease);
  assert.equal(
    (
      await db.query<{ lease: string | null }>("SELECT public_site_claim_derivative($1) lease", [
        key,
      ])
    ).rows[0].lease,
    null,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT public_site_finish_derivative($1,$2,$3) ok", [
        key,
        randomUUID(),
        "b".repeat(64),
      ])
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT public_site_finish_derivative($1,$2,$3) ok", [
        key,
        lease,
        "b".repeat(64),
      ])
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await db.query<{ lease: string | null }>("SELECT public_site_claim_derivative($1) lease", [
        key,
      ])
    ).rows[0].lease,
    null,
  );
  await db.exec("SET ROLE anon");
  await assert.rejects(db.query("SELECT * FROM public_site_derivatives"));
  await assert.rejects(db.query("SELECT public_site_claim_derivative($1)", [key]));
  await db.exec("RESET ROLE");
});

test("video requires a claimed sanitized output, review and current source; errors preserve photos", async () => {
  const publicId = await published({ cidade: "Vídeo QA" });
  const property = (
    await db.query<{ id: string }>(
      "SELECT property_id id FROM cordial_site_publications WHERE public_id=$1",
      [publicId],
    )
  ).rows[0].id;
  const sourceId = randomUUID();
  await db.query(
    "INSERT INTO property_videos(id,property_id,storage_path,mime_type,size_bytes,checksum) VALUES($1,$2,'source/qa.mp4','video/mp4',10000,'source-checksum')",
    [sourceId, property],
  );
  const asset = (
    await db.query<{ id: string }>("SELECT cordial_site_prepare_video($1) id", [sourceId])
  ).rows[0].id;
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_videos WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
  );
  const claim = (
    await db.query<{ job: { id: string; token: string } }>("SELECT cordial_site_claim_video() job")
  ).rows[0].job;
  assert.equal(claim.id, asset);
  assert.equal(
    (await db.query<{ job: unknown }>("SELECT cordial_site_claim_video() job")).rows[0].job,
    null,
  );
  await assert.rejects(
    db.query("SELECT cordial_site_finish_video($1,$2,$3)", [
      asset,
      claim.token,
      JSON.stringify({
        metadataRemoved: true,
        path: "cordial-site/qa.mp4",
        version: "a".repeat(32),
        width: 1080,
        height: 1920,
        duration: 30,
        bytes: 9000,
      }),
    ]),
  );
  const report = {
    mime: "video/mp4",
    videoCodec: "h264",
    audioCodec: "none",
    metadataRemoved: true,
    path: "cordial-site/qa.mp4",
    version: "a".repeat(32),
    width: 1080,
    height: 1920,
    duration: 30,
    bytes: 9000,
  };
  assert.equal(
    (
      await db.query<{ ok: boolean }>("SELECT cordial_site_finish_video($1,$2,$3) ok", [
        asset,
        claim.token,
        JSON.stringify(report),
      ])
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_videos WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
  );
  await db.query("SELECT cordial_site_review_video($1,true)", [asset]);
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_videos WHERE public_id=$1", [publicId]))
      .rows.length,
    1,
  );
  await db.query("UPDATE property_videos SET checksum='revision' WHERE id=$1", [sourceId]);
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_videos WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_documents WHERE public_id=$1", [publicId])).rows
      .length,
    1,
  );
  await db.exec("SET ROLE anon");
  await assert.rejects(db.query("SELECT cordial_site_claim_video()"));
  await assert.rejects(db.query("SELECT * FROM cordial_site_authorized_videos"));
  await db.exec("RESET ROLE");
});

test("editorial order accepts only eligible public UUIDs and does not replace withdrawn choices", async () => {
  const first = await published({ cidade: "Destaque QA" }),
    second = await published({ cidade: "Destaque QA" });
  const internal = (
    await db.query<{ id: string }>(
      "SELECT property_id id FROM cordial_site_publications WHERE public_id=$1",
      [first],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query("SELECT cordial_site_save_content('settings','settings',$1)", [
      JSON.stringify({ featuredPropertyIds: [internal] }),
    ]),
  );
  await db.query("SELECT cordial_site_save_content('settings','settings',$1)", [
    JSON.stringify({ featuredPropertyIds: [second, first] }),
  ]);
  assert.deepEqual(
    (
      await db.query<{ ids: string[] }>(
        "SELECT content->'featuredPropertyIds' ids FROM cordial_site_settings",
      )
    ).rows[0].ids,
    [second, first],
  );
  await db.query("UPDATE cordial_site_publications SET state='withdrawn' WHERE public_id=$1", [
    second,
  ]);
  await db.query("SELECT cordial_site_save_content('settings','settings',$1)", [
    JSON.stringify({ featuredPropertyIds: [second, first], tagline: "Configuração preservada" }),
  ]);
  await assert.rejects(
    db.query("SELECT cordial_site_save_content('settings','settings',$1)", [
      JSON.stringify({ featuredPropertyIds: [first, first] }),
    ]),
  );
  await assert.rejects(
    db.query("SELECT cordial_site_save_content('settings','settings',$1)", [
      JSON.stringify({ featuredPropertyIds: [randomUUID()] }),
    ]),
  );
});
test("worker prepares featured hero and card covers before supplementary gallery photos", async () => {
  const publicId = await published({ destaque_inicial: true });
  const property = (
    await db.query<{ id: string }>(
      "SELECT property_id id FROM cordial_site_publications WHERE public_id=$1",
      [publicId],
    )
  ).rows[0].id;
  const cover = randomUUID(),
    other = randomUUID();
  await db.query(
    "INSERT INTO property_images(id,property_id,position,storage_path) VALUES($1,$2,0,'controlled/cover.jpg'),($3,$2,1,'controlled/other.jpg')",
    [cover, property, other],
  );
  await db.query("SELECT cordial_site_review($1,true,true,true,true,true,true)", [property]);
  const media = (
    await db.query<{ id: string; position: number }>(
      "SELECT id,position FROM cordial_site_authorized_media WHERE public_id=$1 ORDER BY position",
      [publicId],
    )
  ).rows;
  const jobs = (
    await db.query<{ id: string; size: string; priority: number }>(
      "SELECT id,size,priority FROM public_site_derivative_candidates ORDER BY priority,id,size",
    )
  ).rows;
  assert.equal(jobs.length, 6);
  assert.equal(jobs[0].size, "full");
  assert.ok(jobs.slice(0, 3).every((j) => j.id === media[0].id));
  assert.ok(jobs.slice(3).every((j) => j.id === media[1].id));
});

test("tour publication requires explicit equirectangular approval and current authorized 2:1 image", async () => {
  const publicId = await published({ cidade: "Tour QA" });
  const property = (
    await db.query<{ id: string }>(
      "SELECT property_id id FROM cordial_site_publications WHERE public_id=$1",
      [publicId],
    )
  ).rows[0].id;
  const panorama = randomUUID(),
    ordinary = randomUUID();
  await db.query(
    "INSERT INTO property_images(id,property_id,position,storage_path,width,height) VALUES($1,$2,0,'controlled/panorama.jpg',2000,1000),($3,$2,1,'controlled/ordinary.jpg',1500,1000)",
    [panorama, property, ordinary],
  );
  await db.query("SELECT cordial_site_review($1,true,true,true,true,true,true)", [property]);
  const metadata = async () =>
    (
      await db.query<{ id: string; version: string; position: number }>(
        "SELECT id,version,position FROM cordial_site_authorized_media WHERE public_id=$1 ORDER BY position",
        [publicId],
      )
    ).rows;
  const media = await metadata();
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_tours WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
  );
  await assert.rejects(
    db.query("SELECT cordial_site_save_tour($1,$2,true,false,1920,960)", [
      media[0].id,
      media[0].version,
    ]),
  );
  await assert.rejects(
    db.query("SELECT cordial_site_save_tour($1,$2,true,true,1500,750)", [
      media[1].id,
      media[1].version,
    ]),
  );
  await db.query("SELECT cordial_site_save_tour($1,$2,true,true,1920,960)", [
    media[0].id,
    media[0].version,
  ]);
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_tours WHERE public_id=$1", [publicId]))
      .rows.length,
    1,
  );
  assert.equal(
    (
      await db.query<{ has: boolean }>(
        "SELECT (document->>'hasTour')::boolean has FROM cordial_site_documents WHERE public_id=$1",
        [publicId],
      )
    ).rows[0].has,
    true,
  );
  await db.query("UPDATE property_images SET content_hash='changed-panorama' WHERE id=$1", [
    panorama,
  ]);
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_tours WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
  );
  await db.query("SELECT cordial_site_review($1,true,true,true,true,true,true)", [property]);
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_tours WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
    "changed media needs a new explicit tour review too",
  );
  const updated = await metadata();
  await db.query("SELECT cordial_site_save_tour($1,$2,true,true,1920,960)", [
    updated[0].id,
    updated[0].version,
  ]);
  await db.query("UPDATE cordial_site_publications SET state='withdrawn' WHERE public_id=$1", [
    publicId,
  ]);
  assert.equal(
    (await db.query("SELECT * FROM cordial_site_authorized_tours WHERE public_id=$1", [publicId]))
      .rows.length,
    0,
  );
  await db.exec("SET ROLE anon");
  await assert.rejects(db.query("SELECT * FROM cordial_site_tours"));
  await assert.rejects(
    db.query("SELECT cordial_site_save_tour($1,$2,true,true,1920,960)", [
      media[0].id,
      media[0].version,
    ]),
  );
  await db.exec("RESET ROLE");
});
