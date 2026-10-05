import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { morarDatabase } from "./database";

const ADMIN = "00000000-0000-4000-8000-000000000001";
let db: PGlite;
before(async () => {
  db = await morarDatabase();
});
after(async () => {
  await db?.close();
});
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function property(extra: Record<string, unknown> = {}) {
  const row = {
    id: randomUUID(),
    carteira: "morar",
    source: "imobibrasil",
    codigo_morar: randomUUID(),
    codigo_cordial: "PRIVATE-CORDIAL",
    cidade: "Santa Rosa",
    bairro: "Centro",
    tipo: "Casa",
    valor: 320000,
    descricao_imovel: "Descrição pública Morar",
    ...extra,
  };
  await db.query(
    `INSERT INTO properties(${Object.keys(row).join(",")}) VALUES(${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(",")})`,
    Object.values(row),
  );
  return row.id;
}
async function image(id: string, position = 0, extra: Record<string, unknown> = {}) {
  const row = {
    id: randomUUID(),
    property_id: id,
    storage_path: `${id}/${position}.jpg`,
    position,
    is_cover: position === 0,
    ...extra,
  };
  await db.query(
    `INSERT INTO property_images(${Object.keys(row).join(",")}) VALUES(${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(",")})`,
    Object.values(row),
  );
  return row.id;
}
async function review(id: string, media = true, areas = false) {
  return (
    await one<{ id: string }>("SELECT morar_site_review($1,true,true,true,true,$2,$3) id", [
      id,
      media,
      areas,
    ])
  ).id;
}
async function catalog(f: Record<string, unknown> = {}) {
  return (
    await one<{
      result: {
        items: Array<{
          id: string;
          reference: string;
          areas: Record<string, number | null>;
          photoCount: number;
          cover: { id: string } | null;
        }>;
        total: number;
      };
    }>("SELECT morar_site_search($1) result", [JSON.stringify(f)])
  ).result;
}
async function link(id: string, enabled = true, status = "published", availability = "visible") {
  await db.query(
    "INSERT INTO property_provider_publications(property_id,provider,enabled,status,desired_availability,publication_intent_revision) VALUES($1,'morar',$2,$3,$4,1)",
    [id, enabled, status, availability],
  );
}
async function intention(id: string, actor = ADMIN, publish = true, areas = false) {
  return (
    await one<{
      result: {
        ok: boolean;
        publicId: string;
        state: string;
        active: boolean;
        pendingReview: boolean;
        reason: string;
      };
    }>("SELECT morar_site_request_publication($1,$2,$3,NULL,true,$4) result", [
      id,
      actor,
      publish,
      areas,
    ])
  ).result;
}
async function inventory() {
  return (
    await one<{
      result: {
        items: Array<{
          propertyId: string;
          revision: number;
          snapshotHash: string;
          candidate: boolean;
          blockers: string[];
        }>;
        total: number;
        nextCursor: string | null;
      };
    }>("SELECT morar_site_inventory(NULL,500) result")
  ).result;
}
async function batch(
  batchId: string,
  items: unknown[],
  dry = true,
  authorize = false,
  available = false,
) {
  return (
    await one<{
      result: {
        ready: boolean;
        writes: number;
        applied: number;
        replayed: boolean;
        items: unknown[];
      };
    }>("SELECT morar_site_review_batch($1,$2,$3,$4,$5,true,false) result", [
      batchId,
      JSON.stringify(items),
      dry,
      authorize,
      available,
    ])
  ).result;
}

test("migration creates empty owned channel and origin/codes/history never publish", async () => {
  const id = await property();
  await link(id, false);
  assert.equal((await catalog()).total, 0);
  const i = (await inventory()).items.find((x) => x.propertyId === id)!;
  assert.equal(i.candidate, false);
  assert.ok(i.blockers.includes("no_active_morar_intent"));
});

test("explicit review admits nullable imported fields without writing canonical confirmations", async () => {
  const id = await property();
  await image(id);
  const pub = await review(id);
  assert.ok((await catalog()).items.some((x) => x.id === pub));
  const p = await one<{
    autorizacao: null;
    disponibilidade: null;
    registration_completed_at: null;
  }>("SELECT autorizacao,disponibilidade,registration_completed_at FROM properties WHERE id=$1", [
    id,
  ]);
  assert.equal(p.autorizacao, null);
  assert.equal(p.disponibilidade, null);
  assert.equal(p.registration_completed_at, null);
  assert.equal(
    (
      await one<{ c: number }>(
        "SELECT count(*)::int c FROM morar_site_audit WHERE entity_id=$1 AND actor=$2",
        [id, ADMIN],
      )
    ).c > 0,
    true,
  );
});

test("canonical blocks and unfinished Gestão registration cannot be approved", async () => {
  for (const extra of [
    { autorizacao: false },
    { is_draft: true },
    { exibir_imovel: false },
    { archived_at: new Date().toISOString() },
    { removal_state: "pending_archive" },
    { disponibilidade: "vendido" },
    { source: "gestao_cordial" },
  ])
    await assert.rejects(review(await property(extra)));
});

test("Cordial-only listings, private IDs and Cordial references never leak to Morar", async () => {
  const id = await property({
    carteira: "cordial",
    codigo_morar: "PUBLIC-MORAR",
    codigo_cordial: "SECRET-CORDIAL",
    proprietario_nome: "OWNER-SECRET",
    observacao_imovel: "NOTE-SECRET",
    localizacao_maps_url: "MAPS-SECRET",
    logradouro: "ADDRESS-SECRET",
    numero: "99",
  });
  await one("SELECT cordial_site_review($1,true,true,true,true,false,true)", [id]);
  assert.equal((await catalog({ referencia: "PUBLIC-MORAR" })).total, 0);
  const own = await review(id);
  const json = JSON.stringify(await catalog({ referencia: "PUBLIC-MORAR" }));
  for (const forbidden of [
    id,
    "SECRET-CORDIAL",
    "OWNER-SECRET",
    "NOTE-SECRET",
    "MAPS-SECRET",
    "ADDRESS-SECRET",
    "storage_path",
    "codigo_cordial",
  ])
    assert.ok(!json.includes(forbidden), forbidden);
  assert.ok(json.includes(own));
  assert.equal((await catalog({ referencia: "SECRET-CORDIAL" })).total, 0);
});

test("hidden street in prose never appears in public JSON, features, SEO source or text filtering", async () => {
  const street = "Rua São José " + randomUUID();
  const description = `Casa na <strong>${street.toUpperCase().replaceAll(" ", "   ")}</strong>, número 81.`;
  const id = await property({
    codigo_morar: "PRIVATE-STREET",
    logradouro: street,
    numero: "81",
    exibir_endereco_site: "nao",
    descricao_imovel: description,
    pontos_fortes: `Frente para ${street}`,
    caracteristicas: ["Jardim", `Vista para ${street.toUpperCase()}`, "Garagem"],
  });
  const pub = await review(id, false);
  const document = (
    await one<{ document: { description: string; features: string[]; address: string | null } }>(
      "SELECT document FROM morar_site_documents WHERE public_id=$1",
      [pub],
    )
  ).document;
  assert.equal(document.description, "");
  assert.deepEqual(document.features, ["Jardim", "Garagem"]);
  assert.equal(document.address, null);
  assert.ok(!JSON.stringify(document).toLowerCase().includes(street.toLowerCase()));
  assert.equal((await catalog({ q: street })).total, 0);
  const original = await one<{ descricao_imovel: string; pontos_fortes: string }>(
    "SELECT descricao_imovel,pontos_fortes FROM properties WHERE id=$1",
    [id],
  );
  assert.equal(original.descricao_imovel, description);
  assert.equal(original.pontos_fortes, `Frente para ${street}`);
  await db.query("UPDATE properties SET exibir_endereco_site='sim' WHERE id=$1", [id]);
  assert.equal(
    (
      await one<{ document: { description: string; features: string[] } }>(
        "SELECT document FROM morar_site_documents WHERE public_id=$1",
        [pub],
      )
    ).document.description,
    description,
  );
});

test("hidden addresses encoded as HTML entities are withheld before JSON or rendering", async () => {
  for (const encoded of [
    "Rua S&atilde;o Jos&eacute;",
    "rUa&nbsp;S&Atilde;O&nbsp;JOS&Eacute;",
    "Rua&#160;S&#227;o Jos&#233;",
    "Rua&#xA0;S&#xE3;o Jos&#xE9;",
    "Rua&#32;Sa&#771;o Jose&#769;",
    "Rua <b>Sã</b>o José",
    "Rua S&Unknown;o José",
    "Rua S&atildeo Jos&eacute;",
    "Rua S&#8203;ão José",
    "Rua S&#xD800;o José",
    "Rua S&amp;atilde;o José",
  ]) {
    const token = randomUUID();
    const street = `Rua São José ${token}`;
    const description = `Casa na ${encoded} ${token}.`;
    const privateFeature = `Vista para ${encoded} ${token}`;
    const features = ["Jardim &amp; garagem", privateFeature, "Piscina com 12 m&sup2;"];
    const id = await property({
      codigo_morar: `ENTITY-${token}`,
      cidade: "São José",
      bairro: "São José",
      logradouro: street,
      exibir_endereco_site: "nao",
      descricao_imovel: description,
      pontos_fortes: privateFeature,
      caracteristicas: features,
    });
    const pub = await review(id, false);
    const document = (
      await one<{
        document: {
          description: string;
          features: string[];
          city: string;
          district: string;
          address: string | null;
        };
      }>("SELECT document FROM morar_site_documents WHERE public_id=$1", [pub])
    ).document;
    assert.equal(document.description, "", encoded);
    assert.deepEqual(
      document.features,
      ["Jardim &amp; garagem", "Piscina com 12 m&sup2;"],
      encoded,
    );
    assert.equal(document.address, null);
    assert.equal(document.city, "São José");
    assert.equal(document.district, "São José");
    assert.ok(!JSON.stringify(document).includes(`${encoded} ${token}`), encoded);
    assert.ok(!JSON.stringify(document).includes(street), encoded);
    assert.equal((await catalog({ q: street })).total, 0);
    assert.equal((await catalog({ referencia: `ENTITY-${token}` })).total, 1);
    assert.equal(
      (
        await one<{ pontos_fortes: string | null }>(
          "SELECT pontos_fortes FROM morar_site_eligible WHERE public_id=$1",
          [pub],
        )
      ).pontos_fortes,
      null,
    );
    const original = await one<{
      descricao_imovel: string;
      pontos_fortes: string;
      caracteristicas: string[];
    }>("SELECT descricao_imovel,pontos_fortes,caracteristicas FROM properties WHERE id=$1", [id]);
    assert.equal(original.descricao_imovel, description);
    assert.equal(original.pontos_fortes, privateFeature);
    assert.deepEqual(original.caracteristicas, features);
  }
});

test("entity decoding comparison is bounded and does not affect visible addresses", async () => {
  const decoded = await one<{ text: string; unknown: null; format: null; control: null }>(
    `SELECT morar_site_normalize_public_text('rUa&nbsp;S&Atilde;O&#32;JOS&#xE9;') text,
     morar_site_normalize_public_text('Texto &Unknown;') unknown,
     morar_site_normalize_public_text('Texto &#8203;') format,
     morar_site_normalize_public_text('Texto &#128;') control`,
  );
  assert.equal(decoded.text, "rua sao jose");
  assert.equal(decoded.unknown, null);
  assert.equal(decoded.format, null);
  assert.equal(decoded.control, null);
  const description = "Casa na Rua S&atilde;o Jos&eacute;. Texto &Unknown;.";
  const id = await property({
    codigo_morar: `VISIBLE-${randomUUID()}`,
    logradouro: "Rua São José",
    exibir_endereco_site: "sim",
    descricao_imovel: description,
    caracteristicas: ["Jardim &amp; garagem"],
  });
  const pub = await review(id, false);
  assert.equal(
    (
      await one<{ document: { description: string } }>(
        "SELECT document FROM morar_site_documents WHERE public_id=$1",
        [pub],
      )
    ).document.description,
    description,
  );
});

test("approved shared property uses separate public identities and provider failures cannot retire Morar", async () => {
  const id = await property({ codigo_morar: "SHARED-M", codigo_cordial: "SHARED-C" });
  const cordial = (
    await one<{ id: string }>("SELECT cordial_site_review($1,true,true,true,true,false,true) id", [
      id,
    ])
  ).id;
  const morar = await review(id);
  assert.notEqual(cordial, morar);
  await link(id, true, "error");
  await db.query(
    "UPDATE property_provider_publications SET enabled=false,desired_availability='hidden',status='unpublished' WHERE property_id=$1",
    [id],
  );
  assert.ok((await catalog({ referencia: "SHARED-M" })).items.some((x) => x.id === morar));
});

test("registration intent waits for durable completion and never needs an ImobiBrasil ID", async () => {
  const id = await property({
    source: "gestao_cordial",
    is_draft: true,
    autorizacao: true,
    disponibilidade: "sim",
    area_util: 83,
  });
  const intent = await intention(id, ADMIN, true, true);
  assert.equal(intent.state, "draft");
  assert.equal(intent.active, false);
  assert.ok(!(await catalog()).items.some((x) => x.id === intent.publicId));
  await db.query("UPDATE properties SET is_draft=false WHERE id=$1", [id]);
  assert.ok(!(await catalog()).items.some((x) => x.id === intent.publicId));
  await db.query("UPDATE properties SET registration_completed_at=now() WHERE id=$1", [id]);
  const found = (await catalog()).items.find((x) => x.id === intent.publicId)!;
  assert.ok(found);
  assert.equal(found.areas.util, 83);
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM property_provider_publications WHERE property_id=$1",
        [id],
      )
    ).n,
    0,
  );
});

test("nullable registration intent remains pending review after completion", async () => {
  const id = await property({
    source: "gestao_cordial",
    registration_completed_at: new Date().toISOString(),
  });
  const intent = await intention(id);
  assert.equal(intent.pendingReview, true);
  assert.equal(intent.active, false);
  await db.query("UPDATE properties SET descricao_imovel='Edited public description' WHERE id=$1", [
    id,
  ]);
  assert.ok(!(await catalog()).items.some((x) => x.id === intent.publicId));
  assert.equal(await review(id), intent.publicId);
});

test("only a scoped actor can request owned publication and revision conflicts perform no enrollment", async () => {
  const actor = randomUUID();
  await db.query("INSERT INTO auth.users VALUES($1)", [actor]);
  const id = await property({ autorizacao: true, disponibilidade: "sim" });
  await assert.rejects(intention(id, actor));
  await db.query("INSERT INTO user_agencies VALUES($1,'morar')", [actor]);
  assert.equal((await intention(id, actor)).active, true);
  const conflict = await one<{ result: { ok: boolean; conflict: boolean } }>(
    "SELECT morar_site_request_publication($1,$2,true,999) result",
    [await property(), actor],
  );
  assert.equal(conflict.result.conflict, true);
});

test("manual withdrawal survives content, media changes and positive provider statuses", async () => {
  const id = await property({ codigo_morar: "WITHDRAW-M" });
  const pub = await review(id);
  await intention(id, ADMIN, false);
  await db.query("UPDATE properties SET descricao_imovel='Changed' WHERE id=$1", [id]);
  await image(id);
  await link(id, true, "published");
  assert.equal((await catalog({ referencia: "WITHDRAW-M" })).total, 0);
  assert.equal(
    (
      await one<{ manual_withdrawn: boolean }>(
        "SELECT manual_withdrawn FROM morar_site_publications WHERE public_id=$1",
        [pub],
      )
    ).manual_withdrawn,
    true,
  );
});

test("canonical public edits refresh approved content without moving editorial published date", async () => {
  const id = await property({ codigo_morar: "EDIT-M" });
  const pub = await review(id);
  const before = await one<{ published_at: string }>(
    "SELECT published_at::text FROM morar_site_publications WHERE public_id=$1",
    [pub],
  );
  await db.query(
    "UPDATE properties SET descricao_imovel='New public text',valor=390000,updated_at=now() WHERE id=$1",
    [id],
  );
  assert.equal((await catalog({ referencia: "EDIT-M" })).total, 1);
  assert.equal(
    (
      await one<{ published_at: string }>(
        "SELECT published_at::text FROM morar_site_publications WHERE public_id=$1",
        [pub],
      )
    ).published_at,
    before.published_at,
  );
});

test("unknown units are omitted; known units convert correctly without conflating private/useful area", async () => {
  const id = await property({
    codigo_morar: "AREA-M",
    area_util: 70,
    area_privativa: 200,
    area_privativa_unidade: "m2",
    area_total: 100,
    area_total_unidade: "m²",
    area_terreno: 2,
    area_terreno_unidade: "ha",
    area_construida: 90,
  });
  await review(id, false, false);
  const areas = (await catalog({ referencia: "AREA-M" })).items[0].areas;
  assert.deepEqual(areas, { util: null, total: 100, construida: null, terreno: 20000 });
  assert.equal(
    (await catalog({ referencia: "AREA-M", areaTipo: "construida", areaMin: 1 })).total,
    0,
  );
  await review(id, false, true);
  assert.equal((await catalog({ referencia: "AREA-M" })).items[0].areas.util, 70);
  await db.query("UPDATE properties SET area_util=80 WHERE id=$1", [id]);
  assert.equal((await catalog({ referencia: "AREA-M" })).items[0].areas.util, null);
});

test("Morar/combined ready media follows order and Cordial-only derivatives do not pass", async () => {
  const id = await property({ codigo_morar: "MEDIA-M", publish_targets: ["morar"] });
  const cover = await image(id, 0, {
    processing_status: "ready",
    processed_storage_path: "morar.jpg",
    watermark_variant: "morar",
    destination_hash: "morar@v2",
  });
  await image(id, 1);
  const pub = await review(id);
  const item = (await catalog({ referencia: "MEDIA-M" })).items[0];
  assert.equal(item.photoCount, 2);
  assert.equal(
    item.cover!.id,
    (await one<{ id: string }>("SELECT id FROM morar_site_media WHERE image_id=$1", [cover])).id,
  );
  await db.query("UPDATE property_images SET watermark_variant='cordial' WHERE id=$1", [cover]);
  assert.equal((await catalog({ referencia: "MEDIA-M" })).items[0].photoCount, 0);
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM morar_site_authorized_media WHERE public_id=$1",
        [pub],
      )
    ).n,
    0,
  );
});

test("changed legacy, missing position zero and duplicated positions hide the entire gallery", async () => {
  const id = await property({ codigo_morar: "ORDER-M" });
  const cover = await image(id);
  await image(id, 1);
  await review(id);
  await db.query("UPDATE property_images SET storage_path='replaced.jpg' WHERE id=$1", [cover]);
  assert.equal((await catalog({ referencia: "ORDER-M" })).items[0].photoCount, 0);
  await review(id);
  await db.query("UPDATE property_images SET position=2 WHERE id=$1", [cover]);
  assert.equal((await catalog({ referencia: "ORDER-M" })).items[0].photoCount, 0);
  await db.query("UPDATE property_images SET position=0 WHERE id=$1", [cover]);
  await image(id, 1);
  await review(id);
  assert.equal((await catalog({ referencia: "ORDER-M" })).items[0].photoCount, 0);
});

test("new stable public references never publish GC or overwrite commercial codes", async () => {
  const id = await property({ codigo_morar: "GC-INTERNAL" });
  const pub = await review(id);
  const ref = (
    await one<{ public_reference: string }>(
      "SELECT public_reference FROM morar_site_publications WHERE public_id=$1",
      [pub],
    )
  ).public_reference;
  assert.match(ref, /^M-\d{6}$/);
  assert.equal(
    (await one<{ codigo_morar: string }>("SELECT codigo_morar FROM properties WHERE id=$1", [id]))
      .codigo_morar,
    "GC-INTERNAL",
  );
  assert.equal(await review(id), pub);
});

test("batch inventory is paginated, active intent only, and dry run is read-only", async () => {
  const id = await property();
  await link(id, true, "error");
  const snapshot = (await inventory()).items.find((x) => x.propertyId === id)!;
  assert.equal(snapshot.candidate, true);
  const before = (await one<{ n: number }>("SELECT count(*)::int n FROM morar_site_publications"))
    .n;
  const dry = await batch(randomUUID(), [snapshot]);
  assert.equal(dry.ready, false);
  assert.equal(dry.writes, 0);
  assert.equal(
    (await one<{ n: number }>("SELECT count(*)::int n FROM morar_site_publications")).n,
    before,
  );
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let n = 0; n < 30; n++) {
    const result = (
      await one<{ r: { items: Array<{ propertyId: string }>; nextCursor: string | null } }>(
        "SELECT morar_site_inventory($1,2) r",
        [cursor],
      )
    ).r;
    if (!result.items.length) break;
    ids.push(...result.items.map((x) => x.propertyId));
    cursor = result.nextCursor;
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(id));
});

test("explicit nullable batch approval is atomic, auditable and idempotent", async () => {
  const id = await property();
  await link(id);
  await image(id);
  const snapshot = (await inventory()).items.find((x) => x.propertyId === id)!;
  const key = randomUUID();
  assert.equal((await batch(key, [snapshot], true, true, true)).ready, true);
  const applied = await batch(key, [snapshot], false, true, true);
  assert.equal(applied.applied, 1);
  const replay = await batch(key, [snapshot], false, true, true);
  assert.equal(replay.replayed, true);
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM morar_site_publications WHERE property_id=$1",
        [id],
      )
    ).n,
    1,
  );
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM morar_site_activation_batches WHERE id=$1",
        [key],
      )
    ).n,
    1,
  );
  await assert.rejects(batch(key, [snapshot], false, false, true));
});

test("null approval flags never authorize, null dry run never writes, and null limits/items fail closed", async () => {
  const id = await property();
  await link(id);
  const snapshot = (await inventory()).items.find((x) => x.propertyId === id)!;
  await assert.rejects(
    db.query("SELECT morar_site_review($1,true,NULL,true,true,true,false)", [id]),
  );
  await assert.rejects(
    db.query("SELECT morar_site_review($1,true,true,NULL,true,true,false)", [id]),
  );
  await assert.rejects(
    db.query("SELECT morar_site_review($1,true,true,true,NULL,true,false)", [id]),
  );
  const dry = await one<{ result: { dryRun: boolean; writes: number; ready: boolean } }>(
    "SELECT morar_site_review_batch($1,$2,NULL,true,true,true,false) result",
    [randomUUID(), JSON.stringify([snapshot])],
  );
  assert.equal(dry.result.dryRun, true);
  assert.equal(dry.result.writes, 0);
  assert.equal(dry.result.ready, true);
  const denied = await one<{ result: { ready: boolean } }>(
    "SELECT morar_site_review_batch($1,$2,true,NULL,NULL,true,false) result",
    [randomUUID(), JSON.stringify([snapshot])],
  );
  assert.equal(denied.result.ready, false);
  await assert.rejects(db.query("SELECT morar_site_inventory(NULL,NULL)"));
  await assert.rejects(
    db.query("SELECT morar_site_review_batch($1,NULL,true,true,true,true,false)", [randomUUID()]),
  );
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM morar_site_publications WHERE property_id=$1",
        [id],
      )
    ).n,
    0,
  );
});

test("a changed snapshot or blocked record rejects the entire activation", async () => {
  const id = await property();
  await link(id);
  const snapshot = (await inventory()).items.find((x) => x.propertyId === id)!;
  await db.query("UPDATE properties SET valor=355000 WHERE id=$1", [id]);
  await assert.rejects(batch(randomUUID(), [snapshot], false, true, true));
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM morar_site_publications WHERE property_id=$1",
        [id],
      )
    ).n,
    0,
  );
});

test("batch cannot republish manual withdrawals, including a withdrawal after simulation", async () => {
  const id = await property();
  await link(id);
  await review(id);
  const snapshot = (await inventory()).items.find((x) => x.propertyId === id)!;
  const key = randomUUID();
  assert.equal((await batch(key, [snapshot], true, true, true)).ready, true);
  await intention(id, ADMIN, false);
  await assert.rejects(batch(key, [snapshot], false, true, true));
  const current = (await inventory()).items.find((x) => x.propertyId === id)!;
  assert.ok(current.blockers.includes("manual_withdrawal"));
  assert.equal((await batch(randomUUID(), [current], true, true, true)).ready, false);
  assert.equal(
    (
      await one<{ state: string }>(
        "SELECT state FROM morar_site_publications WHERE property_id=$1",
        [id],
      )
    ).state,
    "withdrawn",
  );
});

test("own-only pending requests are reviewable without any historical provider link", async () => {
  const id = await property({
    source: "gestao_cordial",
    registration_completed_at: new Date().toISOString(),
  });
  await intention(id);
  const snapshot = (await inventory()).items.find((x) => x.propertyId === id)!;
  assert.equal(snapshot.candidate, true);
  assert.equal((await batch(randomUUID(), [snapshot], false, true, true)).applied, 1);
});

test("server-owned public views and RPCs are inaccessible to anonymous/authenticated direct clients", async () => {
  await db.exec("SET ROLE anon");
  try {
    await assert.rejects(db.query("SELECT document FROM morar_site_documents"));
    await assert.rejects(db.query("SELECT morar_site_search('{}')"));
    await assert.rejects(
      db.query("SELECT morar_site_request_publication($1,$2,true)", [randomUUID(), ADMIN]),
    );
  } finally {
    await db.exec("RESET ROLE");
  }
  const person = "00000000-0000-4000-8000-000000000002";
  await db.exec(`SET request.jwt.claim.sub='${person}'; SET ROLE authenticated`);
  try {
    assert.equal((await db.query("SELECT * FROM morar_site_publications")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM morar_site_admin_public_catalog")).rows.length, 0);
    await assert.rejects(db.query("SELECT morar_site_inventory(NULL,100)"));
  } finally {
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${ADMIN}'`);
  }
});

test("service role can serve allowlisted documents and admin picker remains permission gated", async () => {
  await db.exec("SET ROLE service_role");
  try {
    const served = (
      await db.query<{ result: { items: unknown[] } }>("SELECT morar_site_search('{}') result")
    ).rows[0];
    assert.ok(served.result.items.length > 0);
  } finally {
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE authenticated");
  try {
    assert.ok(
      (await db.query("SELECT public_id FROM morar_site_admin_public_catalog")).rows.length > 0,
    );
    assert.ok((await db.query("SELECT id FROM morar_site_admin_catalog")).rows.length > 0);
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("leads stay private, deduplicate and triage into Morar with scoped staff", async () => {
  const id = await property({ codigo_morar: "LEAD-M" });
  const pub = await review(id);
  await db.query(
    'UPDATE morar_site_settings SET content=content||\'{"privacy":"Política Morar aprovada"}\'::jsonb WHERE id=true',
  );
  const request = randomUUID();
  const lead = {
    requestId: request,
    name: "Cliente Teste",
    phone: "55999999999",
    message: "Mensagem de interesse",
    kind: "interesse",
    propertyId: pub,
    entryPath: "/site-morar/imovel/" + pub,
    campaign: {},
  };
  await one("SELECT morar_site_submit_lead($1,'fingerprint-morar')", [JSON.stringify(lead)]);
  await one("SELECT morar_site_submit_lead($1,'fingerprint-morar')", [JSON.stringify(lead)]);
  const row = await one<{ id: string }>("SELECT id FROM morar_site_leads WHERE request_id=$1", [
    request,
  ]);
  assert.equal(
    (
      await one<{ n: number }>("SELECT count(*)::int n FROM morar_site_leads WHERE request_id=$1", [
        request,
      ])
    ).n,
    1,
  );
  const secretary = randomUUID();
  await db.query("INSERT INTO auth.users VALUES($1)", [secretary]);
  await db.query("INSERT INTO user_roles VALUES($1,'secretaria')", [secretary]);
  await db.exec(`SET request.jwt.claim.sub='${secretary}'`);
  await assert.rejects(db.query("SELECT morar_site_triage($1,'compra','casa')", [row.id]));
  await db.query("INSERT INTO user_agencies VALUES($1,'morar')", [secretary]);
  const triage = await one<{ id: string }>("SELECT morar_site_triage($1,'compra','casa') id", [
    row.id,
  ]);
  assert.equal(
    (
      await one<{ imobiliaria: string }>("SELECT imobiliaria FROM attendances WHERE id=$1", [
        triage.id,
      ])
    ).imobiliaria,
    "morar",
  );
  assert.equal(
    (await one<{ id: string }>("SELECT morar_site_triage($1,'compra','casa') id", [row.id])).id,
    triage.id,
  );
  await db.exec(`SET request.jwt.claim.sub='${ADMIN}'`);
  const cordial = await property();
  const cp = (
    await one<{ id: string }>("SELECT cordial_site_review($1,true,true,true,true,false,false) id", [
      cordial,
    ])
  ).id;
  await assert.rejects(
    db.query("SELECT morar_site_submit_lead($1,'other-brand')", [
      JSON.stringify({ ...lead, requestId: randomUUID(), propertyId: cp }),
    ]),
  );
});

test("real retirement RPC removes both owned brands and unarchive never resurrects Morar", async () => {
  const id = await property({ codigo_morar: "ARCHIVE-M", codigo_cordial: "ARCHIVE-C" });
  await image(id);
  const pub = await review(id);
  await one("SELECT cordial_site_review($1,true,true,true,true,true,false)", [id]);
  await link(id);
  await one("SELECT property_retire_request($1,$2,'unpublish',NULL)", [id, ADMIN]);
  assert.equal((await catalog({ referencia: "ARCHIVE-M" })).total, 0);
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM morar_site_authorized_media WHERE public_id=$1",
        [pub],
      )
    ).n,
    0,
  );
  assert.equal(
    (await one<{ r: { status: string } }>("SELECT property_archive_finalize($1,NULL) r", [id])).r
      .status,
    "pending",
  );
  await db.query(
    "UPDATE property_provider_publications SET status='unpublished',desired_availability='hidden',publication_intent_revision=archive_intent_revision WHERE property_id=$1",
    [id],
  );
  assert.equal(
    (await one<{ r: { status: string } }>("SELECT property_archive_finalize($1,NULL) r", [id])).r
      .status,
    "archived",
  );
  await one("SELECT property_unarchive($1,$2,NULL)", [id, ADMIN]);
  assert.equal((await catalog({ referencia: "ARCHIVE-M" })).total, 0);
});

test("effective watermark targets include authorized owned Morar without legacy adoption or external queue", async () => {
  const id = await property({
    autorizacao: true,
    disponibilidade: "sim",
    publish_targets: ["cordial"],
  });
  const legacy = await image(id);
  const managed = await image(id, 1, {
    processing_status: "ready",
    original_storage_path: "original.jpg",
    processed_storage_path: "processed.jpg",
    watermark_variant: "cordial",
    destination_hash: "cordial@v2",
    desired_destination_hash: "cordial@v2",
  });
  await intention(id);
  assert.deepEqual(
    (
      await one<{ targets: string[] }>("SELECT property_effective_watermark_targets($1) targets", [
        id,
      ])
    ).targets,
    ["cordial", "morar"],
  );
  const m = await one<{ desired_destination_hash: string; processing_status: string }>(
    "SELECT desired_destination_hash,processing_status FROM property_images WHERE id=$1",
    [managed],
  );
  assert.equal(m.desired_destination_hash, "morar-cordial@v2");
  assert.equal(m.processing_status, "pending");
  assert.equal(
    (
      await one<{ desired_destination_hash: null }>(
        "SELECT desired_destination_hash FROM property_images WHERE id=$1",
        [legacy],
      )
    ).desired_destination_hash,
    null,
  );
  assert.equal(
    (
      await one<{ n: number }>(
        "SELECT count(*)::int n FROM property_sync_jobs WHERE property_id=$1",
        [id],
      )
    ).n,
    0,
  );
  await intention(id, ADMIN, false);
  assert.deepEqual(
    (
      await one<{ targets: string[] }>("SELECT property_effective_watermark_targets($1) targets", [
        id,
      ])
    ).targets,
    ["cordial"],
  );
});

test("filters page all eligible records deterministically and null price stays absent", async () => {
  const city = "Pagination-" + randomUUID();
  const expected: string[] = [];
  for (let i = 0; i < 28; i++) {
    const id = await property({
      cidade: city,
      operacao: i % 2 ? "aluguel" : "venda",
      codigo_morar: `PAGE-${i}`,
      valor: i === 0 ? null : i * 10000,
      valor_modo: i === 0 ? "consulte" : "fixo",
    });
    expected.push(await review(id, false));
  }
  const actual: string[] = [];
  for (let page = 1; page <= 3; page++)
    actual.push(...(await catalog({ cidade: city, pagina: page })).items.map((x) => x.id));
  assert.equal(new Set(actual).size, 28);
  assert.deepEqual([...actual].sort(), expected.sort());
  assert.equal((await catalog({ cidade: city, finalidade: "aluguel", precoMax: 50000 })).total, 3);
  assert.equal((await catalog({ cidade: city, valorModo: "consulte" })).total, 1);
  assert.equal((await catalog({ cidade: city, referencia: "%", exata: "nao" })).total, 0);
});
