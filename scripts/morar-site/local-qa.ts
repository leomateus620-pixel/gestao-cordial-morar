// Isolated integration harness, never imported by src/. No remote database/client is used here.
import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { morarDatabase } from "../../tests/morar-site/database";

if (process.env.QAMORAR_LOCAL_QA !== "true")
  throw Error("Set QAMORAR_LOCAL_QA=true for isolated local testing.");
const root = ".local/morar-site-audit";
const sample = JSON.parse(await readFile(`${root}/qa-sample.json`, "utf8"));
if (!sample.notice?.includes("RESTRICTED LOCAL QA ONLY")) throw Error("Unexpected QA sample.");
const db = await morarDatabase();

async function restoreSnapshot(
  table: "properties" | "property_images" | "property_provider_publications",
  sources: Record<string, unknown>[],
) {
  if (!sources.length) return;
  const columns = (
    await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [table],
    )
  ).rows.map((r) => r.column_name);
  const keys = Object.keys(sources[0]).filter((key) => columns.includes(key));
  const rows = sources.map((source) => Object.fromEntries(keys.map((key) => [key, source[key]])));
  // Import of an already existing snapshot into this test database must preserve canonical states.
  // Production triggers are enabled again before any simulated approval or user interaction.
  await db.exec(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  await db.query(
    `INSERT INTO ${table} (${keys.join(",")}) SELECT ${keys.join(",")} FROM jsonb_populate_recordset(NULL::${table},$1)`,
    [JSON.stringify(rows)],
  );
  await db.exec(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
}

await restoreSnapshot("properties", sample.properties);
await restoreSnapshot("property_images", sample.images);
// Seed the observed active Morar destination only as a candidate link. No provider RPC/job runs.
await restoreSnapshot(
  "property_provider_publications",
  sample.providers.filter((p: Record<string, unknown>) => p.provider === "morar"),
);
// Preserve confirmed local public identities across harness restarts. This map is private QA data.
let previousPublications: { property_id: string; public_id: string; public_reference: string }[] =
  [];
try {
  previousPublications = JSON.parse(await readFile(`${root}/qa-publication-map.json`, "utf8"));
} catch {
  try {
    const previous = JSON.parse(await readFile(`${root}/qa-runtime-report.json`, "utf8"));
    previousPublications = previous.representatives.map((p: Record<string, string>) => ({
      property_id: p.propertyId,
      public_id: p.publicId,
      public_reference: p.reference,
    }));
  } catch {
    /* First startup. */
  }
}
for (const p of previousPublications) {
  if (!sample.properties.some((property: Record<string, unknown>) => property.id === p.property_id))
    continue;
  if (!/^[a-f0-9-]{36}$/.test(p.public_id) || typeof p.public_reference !== "string")
    throw Error("Invalid local publication map");
  await db.query(
    "INSERT INTO morar_site_publications(property_id,public_id,public_reference) VALUES($1,$2,$3)",
    [p.property_id, p.public_id, p.public_reference],
  );
}
const candidateItems: Record<string, unknown>[] = [];
type InventoryPage = {
  items: {
    propertyId: string;
    revision: number;
    snapshotHash: string;
    candidate: boolean;
    blockers: string[];
  }[];
  nextCursor: string | null;
};
let cursor: string | null = null;
for (;;) {
  const page: InventoryPage = (
    await db.query<{ value: InventoryPage }>("SELECT morar_site_inventory($1,100) value", [cursor])
  ).rows[0].value;
  for (const item of page.items) {
    if (!item.candidate || item.blockers.length)
      throw Error("A real QA candidate is blocked by the effective SQL policy.");
    candidateItems.push({
      propertyId: item.propertyId,
      revision: item.revision,
      snapshotHash: item.snapshotHash,
    });
  }
  if (!page.items.length) break;
  cursor = page.nextCursor;
}
if (candidateItems.length !== sample.properties.length || candidateItems.length > 500)
  throw Error("Incomplete or excessive isolated QA review scope.");
const batchId = randomUUID();
const preview = (
  await db.query<{ value: { ready: boolean; writes: number } }>(
    "SELECT morar_site_review_batch($1,$2,true,true,true,true,false) value",
    [batchId, JSON.stringify(candidateItems)],
  )
).rows[0].value;
if (!preview.ready || preview.writes !== 0) throw Error("Isolated batch preview was not ready.");
console.log(
  "LOCAL PGlite ONLY: explicit simulated authorization, availability, content and media review; unknown area units remain unconfirmed. No production approval/publication.",
);
const applied = (
  await db.query<{ value: { applied: number } }>(
    "SELECT morar_site_review_batch($1,$2,false,true,true,true,false) value",
    [batchId, JSON.stringify(candidateItems)],
  )
).rows[0].value;
if (applied.applied !== candidateItems.length)
  throw Error("Isolated batch did not cover all requested candidates.");

// A few observed shared objects are additionally approved ONLY in the local Cordial channel.
// Both sites keep separate public IDs/references/settings/leads and operate on the same canonical object.
const cordialCandidates = sample.properties.filter((p: Record<string, unknown>) =>
  sample.providers.some(
    (link: Record<string, unknown>) =>
      link.property_id === p.id &&
      link.provider === "cordial" &&
      link.enabled === true &&
      link.desired_availability === "visible",
  ),
);
for (const p of cordialCandidates.slice(0, 5))
  await db.query("SELECT cordial_site_review($1,true,true,true,true,true,false)", [p.id]);
const publicationRows = (
  await db.query<{
    property_id: string;
    public_id: string;
    public_reference: string;
    destaque_inicial: boolean;
  }>(
    "SELECT property_id,public_id,public_reference,destaque_inicial FROM morar_site_eligible ORDER BY public_id",
  )
).rows;
const featured = publicationRows.find((p) => p.destaque_inicial);
await writeFile(`${root}/qa-publication-map.json`, JSON.stringify(publicationRows, null, 2));
const privacy =
  "Ambiente LOCAL de testes. Envios ficam somente no banco de teste em memória e não chegam à equipe comercial.";
let configuredSettings: Record<string, Record<string, unknown>> = {};
try {
  configuredSettings = JSON.parse(await readFile(`${root}/qa-public-settings.json`, "utf8"));
} catch {
  /* Only confirmed optional public settings, no invented contacts. */
}
await db.query("UPDATE morar_site_settings SET content=$1", [
  JSON.stringify({
    brand: "Morar Imóveis",
    tagline: "",
    ...configuredSettings.morar,
    privacy,
    heroPropertyId: featured?.public_id ?? null,
  }),
]);
await db.query("UPDATE cordial_site_settings SET content=$1", [
  JSON.stringify({
    brand: "Cordial Imóveis",
    tagline: "Sentir-se em casa!",
    ...configuredSettings.cordial,
    privacy,
  }),
]);
const counts = (
  await db.query<{ morar: number; cordial: number; media: number; provider_jobs: number }>(
    "SELECT (SELECT count(*)::int FROM morar_site_eligible) morar,(SELECT count(*)::int FROM cordial_site_eligible) cordial,(SELECT count(*)::int FROM morar_site_authorized_media) media,(SELECT count(*)::int FROM property_sync_jobs) provider_jobs",
  )
).rows[0];
if (
  counts.morar !== sample.properties.length ||
  counts.media !==
    sample.images.filter((i: Record<string, unknown>) => i.pending_remote_delete !== true).length ||
  counts.provider_jobs !== 0
)
  throw Error(`Local SQL publication/media/job scope mismatch: ${JSON.stringify(counts)}`);
const representatives = sample.representatives.map((r: Record<string, unknown>) => ({
  ...r,
  publicId: publicationRows.find((p) => p.property_id === r.propertyId)?.public_id,
}));
const report = {
  notice: sample.notice,
  generatedAt: new Date().toISOString(),
  localOnly: true,
  bind: "127.0.0.1",
  port: 5192,
  metadataProperties: sample.properties.length,
  metadataImages: sample.images.length,
  downloadedImages: Object.keys(sample.media).length,
  counts,
  simulatedBatchId: batchId,
  representatives,
  firstPublicId: publicationRows[0]?.public_id,
};
await writeFile(`${root}/qa-runtime-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

const namespaces = ["morar_site", "cordial_site"] as const;
type Namespace = (typeof namespaces)[number];
const tables: Record<string, string[]> = {};
for (const namespace of namespaces) {
  for (const [suffix, columns] of Object.entries({
    settings: ["content", "id"],
    documents: ["document", "public_id"],
    authorized_media: ["id", "version", "width", "height", "position", "public_id", "storage_path"],
    pages: ["slug", "kind", "title", "summary", "body", "published_at", "published"],
    eligible: ["public_id"],
    redirects: ["old_path", "publication_id"],
    publications: ["public_id", "state", "published_at"],
  }))
    tables[`${namespace}_${suffix}`] = columns;
}
const unavailable: Record<Namespace, boolean> = { morar_site: false, cordial_site: false };
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let content = "";
  for await (const chunk of req) {
    content += chunk;
    if (content.length > 32768) throw Error("Local request body too large");
  }
  return JSON.parse(content || "{}");
}
function namespaceOf(name: string): Namespace {
  const namespace = namespaces.find((n) => name.startsWith(`${n}_`));
  if (!namespace) throw Error("Unsupported test namespace");
  return namespace;
}
async function status() {
  const leads = (
    await db.query<{ morar: number; cordial: number }>(
      "SELECT (SELECT count(*)::int FROM morar_site_leads) morar,(SELECT count(*)::int FROM cordial_site_leads) cordial",
    )
  ).rows[0];
  return { unavailable, leads: leads.morar, morarLeads: leads.morar, cordialLeads: leads.cordial };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1:5192");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.headers.apikey !== "morar-local-test-only") {
      res.writeHead(401);
      res.end("{}");
      return;
    }
    if (url.pathname === "/__qa/control" && req.method === "POST") {
      const input = await body(req);
      const namespace: Namespace = input.brand === "cordial" ? "cordial_site" : "morar_site";
      if (input.action === "failure") unavailable[namespace] = input.enabled === true;
      else if (input.action === "refresh_search_sql") {
        const migration = await readFile(
          new URL("../../supabase/migrations/20261004150000_morar_owned_site.sql", import.meta.url),
          "utf8",
        );
        const definition = migration.match(
          /CREATE FUNCTION public\.morar_site_search\(f jsonb DEFAULT '\{\}'\) RETURNS jsonb[\s\S]*?\$\$;/,
        )?.[0];
        if (!definition) throw Error("Current effective Morar search SQL not found");
        await db.exec(definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
      } else if (input.action === "withdraw" || input.action === "restore") {
        const publication = (
          await db.query<{ property_id: string }>(
            `SELECT property_id FROM ${namespace}_publications WHERE public_id=$1`,
            [input.publicId],
          )
        ).rows[0];
        if (!publication) throw Error("Unknown local publication");
        await db.query(`SELECT ${namespace}_review($1,$2,true,true,true,true,false)`, [
          publication.property_id,
          input.action === "restore",
        ]);
      } else if (input.action !== "status") throw Error("Unknown local QA action");
      res.end(JSON.stringify(await status()));
      return;
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      const path = decodeURIComponent(url.pathname.split("/property-images/")[1] ?? "");
      const entry = sample.media[path];
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.key)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      res.setHeader("Content-Type", entry.type || "image/jpeg");
      res.end(await readFile(`${root}/qa-images/${entry.key}`));
      return;
    }
    let data: unknown;
    if (url.pathname.startsWith("/rest/v1/rpc/") && req.method === "POST") {
      const name = url.pathname.split("/").at(-1)!;
      const namespace = namespaceOf(name);
      if (unavailable[namespace]) {
        res.writeHead(503);
        res.end("{}");
        return;
      }
      const input = await body(req);
      if (name === `${namespace}_search`)
        data = (
          await db.query<{ v: unknown }>(`SELECT ${namespace}_search($1) v`, [
            JSON.stringify(input.f ?? {}),
          ])
        ).rows[0].v;
      else if (name === `${namespace}_facets`)
        data = (await db.query<{ v: unknown }>(`SELECT ${namespace}_facets() v`)).rows[0].v;
      else if (name === `${namespace}_take_rate`)
        data = (
          await db.query<{ v: unknown }>(`SELECT ${namespace}_take_rate($1,$2,$3) v`, [
            input._bucket,
            input._limit,
            input._seconds,
          ])
        ).rows[0].v;
      else if (name === `${namespace}_submit_lead`)
        data = (
          await db.query<{ v: unknown }>(`SELECT ${namespace}_submit_lead($1,$2) v`, [
            JSON.stringify(input._lead),
            input._fingerprint,
          ])
        ).rows[0].v;
      else throw Error("Unsupported test RPC");
    } else if (url.pathname.startsWith("/rest/v1/") && req.method === "GET") {
      const table = url.pathname.split("/").at(-1)!;
      const allowed = tables[table];
      if (!allowed) throw Error("Unsupported test table");
      if (unavailable[namespaceOf(table)]) {
        res.writeHead(503);
        res.end("{}");
        return;
      }
      const columns = (url.searchParams.get("select") ?? "").split(",");
      if (!columns.length || columns.some((column) => !allowed.includes(column)))
        throw Error("Column not allowed");
      const conditions: string[] = [],
        values: unknown[] = [];
      for (const [key, value] of url.searchParams) {
        if (["select", "order", "limit"].includes(key)) continue;
        if (!allowed.includes(key)) throw Error("Filter column not allowed");
        const separator = value.indexOf(".");
        const op = value.slice(0, separator),
          v = value.slice(separator + 1);
        if (!["eq", "gt"].includes(op)) throw Error("Unsupported filter");
        values.push(v);
        conditions.push(`${key}${op === "eq" ? "=" : ">"}$${values.length}`);
      }
      const order = (url.searchParams.get("order") ?? "")
        .split(",")
        .filter(Boolean)
        .map((term) => {
          const [key, direction] = term.split(".");
          if (!allowed.includes(key) || ![undefined, "asc", "desc"].includes(direction))
            throw Error("Bad order");
          return `${key} ${direction === "desc" ? "DESC" : "ASC"}`;
        });
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw Error("Bad limit");
      data = (
        await db.query(
          `SELECT ${columns.join(",")} FROM ${table}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}${order.length ? ` ORDER BY ${order.join(",")}` : ""} LIMIT ${limit}`,
          values,
        )
      ).rows;
      if (req.headers.accept?.includes("vnd.pgrst.object")) {
        if ((data as unknown[]).length !== 1) {
          res.writeHead(406);
          res.end(
            JSON.stringify({
              code: "PGRST116",
              details: `The result contains ${(data as unknown[]).length} rows`,
            }),
          );
          return;
        }
        data = (data as unknown[])[0];
      }
    } else {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ message: error instanceof Error ? error.message : "Local QA error" }));
  }
}).listen(5192, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
