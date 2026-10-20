import assert from "node:assert/strict";
import test from "node:test";
import type { Transaction, QueryOptions } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  inspectUpgrade,
  loadManifest,
  MIGRATIONS_FOLDER,
  options,
  planUpgrade,
  safeError,
  TARGET,
  type Query,
} from "../../scripts/vistoria/migration";
import { id, inspectionDatabase, userId } from "./database";

const manifest = loadManifest();
const ledgerThrough = (through: number) =>
  manifest.slice(0, through + 1).map((entry) => ({ hash: entry.hash, created_at: entry.when }));
type Database = Awaited<ReturnType<typeof inspectionDatabase>>;
// postgres-js uses simple protocol for parameterless unsafe SQL. PGlite's
// prepared query API rejects multi-command migration files, so mirror the
// live driver's simple protocol with exec(), without editing/splitting SQL.
function simpleProtocol<T extends Database | Transaction>(client: T): T {
  return new Proxy(client, {
    get(target, key) {
      if (key === "query")
        return async (text: string, params: unknown[] = [], options?: QueryOptions) =>
          params.length
            ? target.query(text, params, options)
            : ((await target.exec(text, options)).at(-1) ?? { rows: [], fields: [] });
      if (key === "transaction" && "transaction" in target)
        return (callback: (tx: Transaction) => unknown) =>
          (target as Database).transaction(async (tx) => callback(simpleProtocol(tx)));
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
const queryFor =
  (db: Database): Query =>
  async (text, params = []) =>
    (await db.query<Record<string, unknown>>(text, params)).rows;
async function withLedger(through: 32 | 33 | 34 | 35, schema = "drizzle") {
  const db = await inspectionDatabase(through);
  await db.exec(
    `CREATE SCHEMA IF NOT EXISTS ${schema}; CREATE TABLE ${schema}.__drizzle_migrations(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );
  for (const row of ledgerThrough(through))
    await db.query(`INSERT INTO ${schema}.__drizzle_migrations(hash,created_at) VALUES($1,$2)`, [
      row.hash,
      row.created_at,
    ]);
  return db;
}
test("check é padrão; apply exige confirmação exata e erros não revelam conexão", () => {
  assert.equal(options([]).mode, "check");
  assert.equal(options(["check"]).mode, "check");
  assert.equal(options(["apply", `--confirm=${TARGET}`]).mode, "apply");
  for (const args of [["apply"], ["apply", "--confirm=0034"], ["check", "--apply"]])
    assert.throws(() => options(args));
  const connection = "postgresql://secret:password@private.example/db";
  assert.ok(!safeError(new Error(connection)).includes(connection));
  assert.equal(
    safeError({ message: connection, code: "28P01" }),
    "Falha na operação de banco; consulte o administrador. Código 28P01.",
  );
});
test("planeja apenas pendências 0033/0034/0035 e reconhece aplicação completa", () => {
  assert.deepEqual(
    planUpgrade(manifest, ledgerThrough(32)).map((e) => e.idx),
    [33, 34, 35],
  );
  assert.deepEqual(
    planUpgrade(manifest, ledgerThrough(33)).map((e) => e.idx),
    [34, 35],
  );
  assert.deepEqual(
    planUpgrade(manifest, ledgerThrough(34)).map((e) => e.idx),
    [35],
  );
  assert.deepEqual(planUpgrade(manifest, ledgerThrough(35)), []);
});
test("recusa histórico vazio, buraco, hash divergente e pendências de outros módulos", () => {
  assert.throws(() => planUpgrade(manifest, []), /Histórico vazio/);
  assert.throws(() => planUpgrade(manifest, ledgerThrough(31)), /anteriores à 0033/);
  assert.throws(
    () =>
      planUpgrade(
        manifest,
        ledgerThrough(34).filter((_, i) => i !== 5),
      ),
    /divergente/,
  );
  const changed = ledgerThrough(34);
  changed[34].hash = "f".repeat(64);
  assert.throws(() => planUpgrade(manifest, changed), /divergente/);
  assert.throws(
    () =>
      planUpgrade(
        [...manifest, { ...manifest[35], idx: 36, tag: "0036_other" }],
        ledgerThrough(34),
      ),
    /posteriores/,
  );
});
test("inspeção roda em transação somente leitura e não cria histórico", async () => {
  const db = await inspectionDatabase(34);
  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec("SET TRANSACTION READ ONLY");
        await inspectUpgrade(
          async (text, params = []) => (await tx.query<Record<string, unknown>>(text, params)).rows,
        );
      }),
      /histórico.*existente/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM information_schema.tables WHERE table_name='__drizzle_migrations'",
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("histórico ambíguo e schema presente sem registro da 0033 são recusados", async () => {
  const db = await withLedger(34);
  try {
    await db.exec(
      "CREATE TABLE public.__drizzle_migrations(id serial,hash text,created_at bigint)",
    );
    await assert.rejects(inspectUpgrade(queryFor(db)), /ambíguo/);
    await db.exec(
      "DROP TABLE public.__drizzle_migrations; DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= 1792480558876",
    );
    await assert.rejects(inspectUpgrade(queryFor(db)), /aplicação parcial/);
  } finally {
    await db.close();
  }
});
test("Drizzle aplica só 0035 no histórico existente, preserva dados e repetir é no-op", async () => {
  const db = await withLedger(34, "public"),
    query = queryFor(db);
  try {
    await db.query(
      "INSERT INTO inspection_documents(inspection_id,version,storage_path,byte_size,sha256,snapshot,created_by) VALUES($1,1,$2,100,$3,$4,$5)",
      [
        id,
        `${id}/docs/v1-${"a".repeat(16)}.pdf`,
        "a".repeat(64),
        { fixture: "conteúdo original" },
        userId,
      ],
    );
    const beforeRows = (await db.query("SELECT to_jsonb(i) AS row FROM inspections i")).rows;
    const beforeDocs = (await db.query("SELECT * FROM inspection_documents")).rows;
    const before = await db.transaction(async (tx) => {
      await tx.exec("SET TRANSACTION READ ONLY");
      return inspectUpgrade(
        async (text, params = []) => (await tx.query<Record<string, unknown>>(text, params)).rows,
      );
    });
    assert.equal(before.schema, "public");
    assert.deepEqual(
      before.pending.map((e) => e.tag),
      [TARGET],
    );
    const orm = drizzle(simpleProtocol(db));
    await migrate(orm, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: before.schema });
    const after = await inspectUpgrade(query);
    assert.equal(after.pending.length, 0);
    assert.equal(after.checks.length, 5);
    assert.deepEqual(
      (await db.query("SELECT to_jsonb(i) AS row FROM inspections i")).rows,
      beforeRows,
    );
    assert.deepEqual((await db.query("SELECT * FROM inspection_documents")).rows, beforeDocs);
    const ledger = (await db.query("SELECT * FROM public.__drizzle_migrations ORDER BY id")).rows;
    assert.equal(ledger.length, 36);
    await migrate(orm, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: after.schema });
    assert.deepEqual(
      (await db.query("SELECT * FROM public.__drizzle_migrations ORDER BY id")).rows,
      ledger,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM information_schema.tables WHERE table_schema='drizzle' AND table_name='__drizzle_migrations'",
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("Drizzle completa 0033–0035 em ordem sem reaplicar o prefixo já registrado", async () => {
  const db = await withLedger(32);
  try {
    const before = await inspectUpgrade(queryFor(db));
    await migrate(drizzle(simpleProtocol(db)), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: before.schema,
    });
    assert.equal((await inspectUpgrade(queryFor(db))).pending.length, 0);
    assert.equal((await db.query("SELECT * FROM inspections")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM drizzle.__drizzle_migrations")).rows.length, 36);
  } finally {
    await db.close();
  }
});
test("falha no meio da 0035 reverte DDL e não registra sucesso no journal", async () => {
  const db = await withLedger(34);
  try {
    await db.exec("DROP POLICY inspection_media_obj_insert ON storage.objects");
    await assert.rejects(
      migrate(drizzle(simpleProtocol(db)), { migrationsFolder: MIGRATIONS_FOLDER }),
      (error) =>
        error instanceof Error &&
        "cause" in error &&
        (error.cause as { code?: string })?.code === "42704",
    );
    assert.deepEqual(
      (await inspectUpgrade(queryFor(db))).pending.map((e) => e.tag),
      [TARGET],
    );
    assert.equal(
      (await db.query("SELECT * FROM pg_trigger WHERE tgname LIKE '%_aggregate'")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ function: string | null }>(
          "SELECT to_regprocedure('public.inspection_snapshot(uuid)') AS function",
        )
      ).rows[0].function,
      null,
    );
    assert.equal((await db.query("SELECT * FROM drizzle.__drizzle_migrations")).rows.length, 35);
  } finally {
    await db.close();
  }
});
test("journal já aplicado não mascara remoção de gatilho ou privilégio ampliado", async () => {
  const db = await withLedger(35),
    query = queryFor(db);
  try {
    assert.equal((await inspectUpgrade(query)).pending.length, 0);
    await db.exec(
      "GRANT EXECUTE ON FUNCTION inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb) TO authenticated",
    );
    await assert.rejects(inspectUpgrade(query), /permissões divergentes/);
    await db.exec(
      "REVOKE EXECUTE ON FUNCTION inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb) FROM authenticated; ALTER TABLE inspection_items DISABLE TRIGGER inspection_items_aggregate",
    );
    await assert.rejects(inspectUpgrade(query), /gatilhos/);
  } finally {
    await db.close();
  }
});
