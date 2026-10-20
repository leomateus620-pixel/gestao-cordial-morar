import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

export const TARGET = "0035_vistoria_field_upgrade";
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle/migrations/", import.meta.url),
);
export class UpgradeError extends Error {}
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
type JournalEntry = { idx: number; tag: string; when: number };
export type Migration = JournalEntry & { hash: string };
export function loadManifest(folder = MIGRATIONS_FOLDER): Migration[] {
  const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8")) as {
    entries: JournalEntry[];
  };
  const files = readMigrationFiles({ migrationsFolder: folder });
  const manifest = journal.entries.map((entry, index) => ({ ...entry, hash: files[index].hash }));
  validateManifest(manifest);
  return manifest;
}
function validateManifest(manifest: Migration[]) {
  if (manifest.at(-1)?.tag !== TARGET || manifest.length !== 36)
    throw new UpgradeError(
      "Este comando exige o journal da PR #34 até 0035, sem migrações posteriores.",
    );
  for (const [index, entry] of manifest.entries())
    if (
      entry.idx !== index ||
      !/^\d{4}_[a-z0-9_]+$/.test(entry.tag) ||
      !/^[a-f0-9]{64}$/.test(entry.hash) ||
      !Number.isSafeInteger(entry.when) ||
      (index > 0 && entry.when <= manifest[index - 1].when)
    )
      throw new UpgradeError("Journal inválido: índices, hashes ou datas fora de ordem.");
}
export function planUpgrade(manifest: Migration[], ledger: Record<string, unknown>[]) {
  validateManifest(manifest);
  if (!ledger.length)
    throw new UpgradeError(
      "Histórico vazio. Este comando não inicializa bancos nem aplica migrações de outros módulos.",
    );
  const applied = [...ledger].sort((a, b) => Number(a.created_at) - Number(b.created_at));
  if (applied.length > manifest.length)
    throw new UpgradeError("O banco tem migrações além do journal deste upgrade.");
  for (const [index, row] of applied.entries()) {
    const entry = manifest[index];
    if (Number(row.created_at) !== entry.when || row.hash !== entry.hash)
      throw new UpgradeError(
        `Histórico divergente em ${entry.tag}. Não altere hashes nem marque migrações como aplicadas manualmente.`,
      );
  }
  const pending = manifest.slice(applied.length);
  if (pending.some((entry) => entry.idx < 33))
    throw new UpgradeError(
      "Há migrações anteriores à 0033 pendentes. Regularize pelo fluxo existente antes deste upgrade de vistoria.",
    );
  return pending;
}
export async function inspectUpgrade(query: Query, manifest = loadManifest()) {
  const tables = await query(
    "SELECT table_schema FROM information_schema.tables WHERE table_name='__drizzle_migrations' AND table_type='BASE TABLE' ORDER BY table_schema",
  );
  if (tables.length !== 1)
    throw new UpgradeError(
      "É necessário um único histórico __drizzle_migrations existente. Histórico ausente ou ambíguo; nenhum será criado.",
    );
  const schema = String(tables[0].table_schema);
  // Quote the discovered identifier, never interpolate a connection URL.
  const identifier = '"' + schema.replaceAll('"', '""') + '"';
  const ledger = await query(
    `SELECT hash,created_at FROM ${identifier}."__drizzle_migrations" ORDER BY created_at,id`,
  );
  const pending = planUpgrade(manifest, ledger);
  if (pending.some((entry) => entry.idx === 33)) {
    const existing = await query("SELECT to_regclass('public.inspections')::text AS name");
    if (existing[0]?.name)
      throw new UpgradeError(
        "As tabelas da vistoria existem, mas a 0033 não consta no histórico. Investigue a aplicação parcial antes de continuar.",
      );
  }
  const checks = pending.length ? [] : await verifyUpgrade(query);
  return { schema, pending, checks };
}

export async function verifyUpgrade(query: Query) {
  const checks: string[] = [];
  const rls = await query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('inspections','inspection_rooms','inspection_items','inspection_media','inspection_notes','inspection_documents','inspection_events') AND c.relrowsecurity`,
  );
  if (rls.length !== 7) throw new UpgradeError("Verificação: RLS ausente em tabelas da vistoria.");
  checks.push("RLS nas sete tabelas");
  const triggers = await query(
    `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O' AND ((t.tgname IN ('inspection_rooms_aggregate','inspection_items_aggregate','inspection_media_aggregate','inspection_notes_aggregate') AND p.proname='inspection_touch_aggregate') OR (t.tgname='inspection_media_position_guard' AND p.proname='inspection_media_position'))`,
  );
  if (triggers.length !== 5)
    throw new UpgradeError(
      "Verificação: gatilhos de revisão agregada ou posição ausentes/desativados.",
    );
  checks.push("Quatro gatilhos de revisão agregada e ordenação de fotos");
  const fks = await query(
    `SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('inspection_items','inspection_media','inspection_notes') AND c.contype='f' AND cardinality(c.conkey)=2 AND c.convalidated`,
  );
  if (fks.length < 5) throw new UpgradeError("Verificação: FKs compostas da vistoria incompletas.");
  checks.push("FKs compostas preservadas");
  const functions = [
    ["inspection_snapshot(uuid)", true, true],
    ["inspection_reorder_media(uuid,uuid,integer,uuid[])", true, true],
    ["inspection_finalize(uuid,integer,text,integer,text,jsonb)", true, false],
    ["inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb)", true, false],
    ["inspection_list(text,text,text,text,timestamptz,timestamptz,text,uuid,integer)", false, true],
    ["inspection_create(jsonb,jsonb)", false, true],
  ] as const;
  for (const [signature, definer, authenticated] of functions) {
    const rows = await query(
      `SELECT p.prosecdef,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
      [`public.${signature}`],
    );
    const row = rows[0];
    if (
      !row ||
      row.prosecdef !== definer ||
      row.authenticated !== authenticated ||
      row.anon !== false ||
      row.service !== true
    )
      throw new UpgradeError(`Verificação: função ou permissões divergentes em ${signature}.`);
  }
  checks.push("RPCs e privilégios de emissão exclusivos do servidor");
  const policies = await query(
    "SELECT with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='inspection_media_obj_insert' AND cmd='INSERT'",
  );
  const condition = String(policies[0]?.with_check ?? "");
  if (
    !condition.includes("'docs'") ||
    !condition.includes("<>") ||
    !condition.includes("inspection_can_edit")
  )
    throw new UpgradeError(
      "Verificação: política de inserção de mídias não exclui documentos oficiais.",
    );
  checks.push("Política de storage exclui /docs/ da inserção autenticada");
  return checks;
}

export function options(args: string[]) {
  if (!args.length) return { mode: "check" as const };
  if (args.length === 1 && args[0] === "check") return { mode: "check" as const };
  if (args.length === 2 && args[0] === "apply" && args[1] === `--confirm=${TARGET}`)
    return { mode: "apply" as const };
  throw new UpgradeError(`Use check, ou apply --confirm=${TARGET}.`);
}
export function safeError(error: unknown) {
  if (error instanceof UpgradeError) return error.message;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return (
    "Falha na operação de banco; consulte o administrador." +
    (/^[A-Z0-9]{5}$/.test(code) ? ` Código ${code}.` : "")
  );
}
