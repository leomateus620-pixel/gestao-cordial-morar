import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { testDatabase } from "./database";
import {
  normalizePublicIds,
  pushRecentProperty,
  visitorSelectionFingerprint,
} from "../../src/lib/selecoes/visitor-rules";

let db: PGlite;
let legacyAcl: unknown;
const hash = () => randomBytes(32).toString("hex");
before(async () => {
  db = await testDatabase();
  await db.exec(`CREATE TABLE IF NOT EXISTS profiles(id uuid PRIMARY KEY,nome text);
    CREATE TABLE IF NOT EXISTS user_roles(user_id uuid,role text);
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS codigo text;
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS valor_exibido text;
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS valor_condominio numeric;
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS valor_iptu numeric;
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS localizacao_exibida text;
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS area_principal numeric;
    ALTER TABLE property_images ADD COLUMN IF NOT EXISTS pending_remote_delete boolean;`);
  for (const migration of [
    "0010_shared_selections",
    "0011_shared_selections_hardening",
    "0012_shared_selections_responsavel",
  ])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${migration}.sql`, import.meta.url), "utf8"),
    );
  legacyAcl = (
    await db.query(
      `SELECT oid::regprocedure::text AS signature,proacl::text FROM pg_proc WHERE proname IN ('shared_selection_save','shared_selection_close','shared_selection_public') ORDER BY 1`,
    )
  ).rows;
  await db.exec(
    await readFile(
      new URL("../../drizzle/migrations/0022_cordial_visitor_selections.sql", import.meta.url),
      "utf8",
    ),
  );
});
after(async () => {
  await db?.close();
});

async function approvedProperty(extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const row = {
    id,
    codigo_cordial: `REF-${id.slice(0, 8)}`,
    cidade: "Santa Rosa",
    bairro: "Centro",
    tipo: "Casa",
    valor: 0,
    descricao_imovel: "Descrição pública.",
    ...extra,
  };
  await db.query(
    `INSERT INTO properties(${Object.keys(row).join(",")}) VALUES(${Object.keys(row)
      .map((_, index) => `$${index + 1}`)
      .join(",")})`,
    Object.values(row),
  );
  const result = await db.query<{ id: string }>(
    "SELECT cordial_site_review($1,true,true,true,true,false,true) id",
    [id],
  );
  return { internalId: id, publicId: result.rows[0].id };
}
async function create(ids: string[], requestHash = hash(), tokenHash = hash()) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    "SELECT shared_selection_visitor_create($1,$2,$3::uuid[]) AS result",
    [requestHash, tokenHash, ids],
  );
  return { ...result.rows[0].result, requestHash, tokenHash };
}
async function open(tokenHash: string) {
  return (
    await db.query<{
      result: {
        state: string;
        expiresAt: string;
        items: Array<{
          available: boolean;
          key: number;
          property: { id: string; price: number; address: string | null };
        }>;
      };
    }>("SELECT shared_selection_visitor_public($1) AS result", [tokenHash])
  ).rows[0].result;
}

test("five public choices persist in order and are readable independently of the creating browser", async () => {
  const listings = await Promise.all(Array.from({ length: 5 }, () => approvedProperty()));
  const publicIds = listings.map((item) => item.publicId);
  const saved = await create(publicIds);
  assert.equal(saved.ok, true);
  // No draft/client state is passed to this independent database read: only the bearer hash.
  const read = await open(saved.tokenHash);
  assert.equal(read.state, "ok");
  assert.deepEqual(
    read.items.map((item) => item.property.id),
    publicIds,
  );
  assert.equal(read.items[0].property.price, 0, "a real zero must remain a value");
  const lifetime = new Date(read.expiresAt).getTime() - Date.now();
  assert.ok(lifetime > 29 * 86400000 && lifetime <= 30 * 86400000);
  assert.deepEqual(Object.keys(read).sort(), ["expiresAt", "items", "state"]);
});

test("visitor resolution rejects internal UUIDs and records without channel approval", async () => {
  const listing = await approvedProperty();
  assert.equal((await create([listing.internalId])).error, "unavailable");
  const unapproved = randomUUID();
  await db.query("INSERT INTO properties(id,codigo_cordial) VALUES($1,'INTERNAL-ONLY')", [
    unapproved,
  ]);
  assert.equal((await create([unapproved])).error, "unavailable");
  assert.equal((await create([randomUUID()])).error, "unavailable");
});

test("withdrawal is revalidated on a previously opened token, without replacement or private fields", async () => {
  const listing = await approvedProperty({
    exibir_endereco_site: "sim",
    logradouro: "PRIVATE-STREET",
    numero: "99",
    proprietario_nome: "PRIVATE-OWNER",
    localizacao_maps_url: "https://maps.invalid/PRIVATE-MAP",
  });
  const saved = await create([listing.publicId]);
  const first = await open(saved.tokenHash);
  assert.equal(first.items[0].property.address, null);
  assert.doesNotMatch(
    JSON.stringify(first),
    /PRIVATE-STREET|PRIVATE-OWNER|PRIVATE-MAP|logradouro|storage_path|token_hash|request_hash/,
  );
  await db.query("UPDATE cordial_site_publications SET state='withdrawn' WHERE public_id=$1", [
    listing.publicId,
  ]);
  const withdrawn = await open(saved.tokenHash);
  assert.deepEqual(withdrawn.items, [{ available: false, key: 1 }]);
  assert.doesNotMatch(JSON.stringify(withdrawn), new RegExp(listing.publicId));
});

test("idempotent retry preserves one token and rejects reuse for different choices", async () => {
  const first = await approvedProperty(),
    second = await approvedProperty();
  const requestHash = hash(),
    tokenHash = hash();
  const saved = await create([first.publicId, first.publicId], requestHash, tokenHash);
  const retry = await create([first.publicId], requestHash, tokenHash);
  assert.equal(saved.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(saved.expiresAt, retry.expiresAt);
  const count = await db.query<{ count: number }>(
    "SELECT count(*)::integer count FROM shared_selection_visitors WHERE request_hash=$1",
    [requestHash],
  );
  assert.equal(count.rows[0].count, 1);
  assert.equal((await create([second.publicId], requestHash, tokenHash)).error, "request_reused");
  assert.equal((await create([first.publicId], requestHash, hash())).error, "request_reused");
});

test("empty, excessive, invalid, expired and missing tokens have explicit states", async () => {
  assert.equal((await create([])).error, "limit");
  assert.equal((await create(Array.from({ length: 21 }, () => randomUUID()))).error, "limit");
  assert.equal((await open("invalid")).state, "invalid");
  assert.equal((await open(hash())).state, "invalid");
  const listing = await approvedProperty(),
    saved = await create([listing.publicId]);
  await db.query(
    "UPDATE shared_selection_visitors SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [saved.tokenHash],
  );
  assert.equal((await open(saved.tokenHash)).state, "expired");
  assert.equal(
    (await create([listing.publicId], saved.requestHash, saved.tokenHash)).error,
    "expired",
  );
});

test("anonymous and authenticated callers cannot create/read visitor rows or mutate Gestão selections", async () => {
  const acl = (
    await db.query(
      `SELECT oid::regprocedure::text AS signature,proacl::text FROM pg_proc WHERE proname IN ('shared_selection_save','shared_selection_close','shared_selection_public') ORDER BY 1`,
    )
  ).rows;
  assert.deepEqual(acl, legacyAcl, "legacy grants must remain unchanged");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(
        db.query("SELECT * FROM shared_selection_visitors"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT shared_selection_visitor_public($1)", [hash()]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT shared_selection_visitor_create($1,$2,$3::uuid[])", [
          hash(),
          hash(),
          [randomUUID()],
        ]),
        /permission denied/,
      );
      if (role === "anon")
        await assert.rejects(
          db.query("SELECT shared_selection_close($1)", [randomUUID()]),
          /permission denied/,
        );
    } finally {
      await db.exec("RESET ROLE");
    }
  }
});

test("local draft normalization preserves distinct UUIDs/order and bounds recent history", () => {
  const first = randomUUID(),
    second = randomUUID();
  assert.deepEqual(normalizePublicIds([first, "private-note", first, second]), [first, second]);
  assert.notEqual(
    visitorSelectionFingerprint([first, second]),
    visitorSelectionFingerprint([second, first]),
  );
  const recent = Array.from({ length: 12 }, () => randomUUID());
  assert.deepEqual(pushRecentProperty(recent, recent[4]), [
    recent[4],
    ...recent.filter((id) => id !== recent[4]),
  ]);
  const next = pushRecentProperty(recent, first);
  assert.equal(next.length, 12);
  assert.equal(next[0], first);
});
