import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  inspectUpgrade,
  loadManifest,
  MIGRATIONS_FOLDER,
  options,
  safeError,
  UpgradeError,
  type Query,
} from "./migration";

async function main() {
  const { mode } = options(process.argv.slice(2));
  const manifest = loadManifest();
  const url = process.env.LOVABLE_DB_MIGRATION_URL;
  if (!url)
    throw new UpgradeError(
      "Defina LOVABLE_DB_MIGRATION_URL no ambiente de execução. A URL nunca é impressa.",
    );
  const connection = new URL(url);
  if (!["postgres:", "postgresql:"].includes(connection.protocol))
    throw new UpgradeError("A conexão de migração precisa ser PostgreSQL.");
  // One session retains the advisory lock across the official Drizzle migrator.
  const client = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 0,
    max_lifetime: 0,
    connect_timeout: 15,
    onnotice: () => {},
    connection: {
      application_name: "vistoria-migration-0035",
      lock_timeout: 10000,
      statement_timeout: 120000,
    },
  });
  const query: Query = async (text, params = []) => [
    ...(await client.unsafe(text, params as never[])),
  ];
  let locked = false,
    committed = false;
  try {
    if (mode === "check") {
      const result = await client.begin("read only", async (tx) =>
        inspectUpgrade(
          async (text, params = []) => [...(await tx.unsafe(text, params as never[]))],
          manifest,
        ),
      );
      console.log(
        JSON.stringify(
          {
            status: result.pending.length ? "ready" : "verified",
            mode,
            ledgerSchema: result.schema,
            pending: result.pending.map(({ tag, hash }) => ({ tag, hash })),
            checks: result.checks,
          },
          null,
          2,
        ),
      );
      return;
    }
    const lock = await query(
      "SELECT pg_try_advisory_lock(hashtext('gestao-cordial-morar:drizzle-journal')) AS locked,pg_backend_pid() AS pid",
    );
    if (lock[0]?.locked !== true)
      throw new UpgradeError("Outra aplicação de migração está em andamento. Nada foi executado.");
    locked = true;
    const before = await inspectUpgrade(query, manifest);
    const current = await query("SELECT pg_backend_pid() AS pid");
    if (current[0]?.pid !== lock[0].pid)
      throw new UpgradeError("A sessão de banco mudou. Nenhuma migração será iniciada.");
    if (before.pending.length) {
      console.log(
        JSON.stringify({ mode, applying: before.pending.map(({ tag, hash }) => ({ tag, hash })) }),
      );
      // Reads the existing journal and writes the SAME existing Drizzle ledger.
      await migrate(drizzle(client), {
        migrationsFolder: MIGRATIONS_FOLDER,
        migrationsSchema: before.schema,
      });
      committed = true;
    }
    const after = await inspectUpgrade(query, manifest);
    if (after.pending.length)
      throw new UpgradeError("Verificação: ainda há migrações pendentes depois da aplicação.");
    console.log(
      JSON.stringify(
        {
          status: committed ? "applied-and-verified" : "already-applied-and-verified",
          mode,
          ledgerSchema: after.schema,
          applied: before.pending.map((entry) => entry.tag),
          checks: after.checks,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (committed)
      console.error(
        "O Drizzle confirmou a transação, mas a verificação posterior falhou. Não reexecute SQL manualmente; investigue o estado registrado.",
      );
    throw error;
  } finally {
    if (locked)
      await query(
        "SELECT pg_advisory_unlock(hashtext('gestao-cordial-morar:drizzle-journal'))",
      ).catch(() => {});
    await client.end({ timeout: 5 });
  }
}
main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
