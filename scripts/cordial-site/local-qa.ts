// Test harness, never imported by src/. Binds exclusively to loopback.
// It exercises the REAL SQL migration and public server boundary against isolated PostgreSQL.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { testDatabase } from "../../tests/cordial-site/database";
if (process.env.CORDIAL_LOCAL_QA !== "true")
  throw Error("Set CORDIAL_LOCAL_QA=true for isolated local testing.");
const root = ".local/cordial-site-audit";
const sample = JSON.parse(await readFile(`${root}/qa-sample.json`, "utf8"));
const db = await testDatabase();
for (const table of ["properties", "property_images"]) {
  const allowed = (
    await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name=$1",
      [table],
    )
  ).rows.map((c) => c.column_name);
  for (const source of table === "properties" ? sample.properties : sample.images) {
    const entries = Object.entries(source).filter(([key]) => allowed.includes(key));
    const row = Object.fromEntries(entries);
    await db.query(
      `INSERT INTO ${table} (${entries.map(([key]) => key).join(",")}) SELECT ${entries.map(([key]) => key).join(",")} FROM jsonb_populate_record(NULL::${table},$1)`,
      [JSON.stringify(row)],
    );
  }
}
await db.query("UPDATE cordial_site_settings SET content=$1", [
  JSON.stringify({
    brand: "Cordial Imóveis",
    tagline: "Sentir-se em casa!",
    privacy:
      "Ambiente LOCAL de testes. Envios ficam somente no banco de teste em memória e não chegam à equipe comercial.",
  }),
]);
for (const p of sample.properties)
  await db.query("SELECT cordial_site_review($1,true,true,true,true,true,false)", [p.id]);
const publicIds = (
  await db.query<{ public_id: string }>(
    "SELECT public_id FROM cordial_site_eligible ORDER BY public_id",
  )
).rows;
console.log(
  JSON.stringify({
    localOnly: true,
    properties: publicIds.length,
    first: publicIds[0]?.public_id,
    port: 5190,
  }),
);
const tables: Record<string, string[]> = {
  cordial_site_settings: ["content", "id"],
  cordial_site_documents: ["document", "public_id"],
  cordial_site_authorized_media: [
    "id",
    "version",
    "width",
    "height",
    "position",
    "public_id",
    "storage_path",
  ],
  cordial_site_pages: ["slug", "kind", "title", "summary", "body", "published_at", "published"],
  cordial_site_eligible: ["public_id"],
  cordial_site_redirects: ["old_path", "publication_id"],
  cordial_site_publications: ["public_id", "state", "published_at"],
};
let unavailable = false;
createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1:5190");
    let data: unknown;
    res.setHeader("Content-Type", "application/json");
    if (req.headers.apikey !== "cordial-local-test-only") {
      res.writeHead(401);
      res.end("{}");
      return;
    }
    if (url.pathname === "/__qa/control" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      if (input.action === "failure") unavailable = input.enabled === true;
      else if (["withdraw", "restore"].includes(input.action)) {
        const publication = (
          await db.query<{ property_id: string }>(
            "SELECT property_id FROM cordial_site_publications WHERE public_id=$1",
            [input.publicId],
          )
        ).rows[0];
        if (!publication) throw Error("Unknown local publication");
        await db.query("SELECT cordial_site_review($1,$2,true,true,true,true,false)", [
          publication.property_id,
          input.action === "restore",
        ]);
      } else if (input.action !== "status") throw Error("Unknown local QA action");
      const leads = (
        await db.query<{ count: number }>("SELECT count(*)::int count FROM cordial_site_leads")
      ).rows[0].count;
      res.end(JSON.stringify({ unavailable, leads }));
      return;
    }
    if (unavailable) {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      const path = decodeURIComponent(url.pathname.split("/property-images/")[1] ?? "");
      const entry = sample.media[path];
      if (!entry) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      res.setHeader("Content-Type", entry.type || "image/jpeg");
      res.end(await readFile(`${root}/qa-images/${entry.key}`));
      return;
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const name = url.pathname.split("/").at(-1);
      if (name === "cordial_site_search")
        data = (
          await db.query<{ v: unknown }>("SELECT cordial_site_search($1) v", [
            JSON.stringify(input.f),
          ])
        ).rows[0].v;
      else if (name === "cordial_site_facets")
        data = (await db.query<{ v: unknown }>("SELECT cordial_site_facets() v")).rows[0].v;
      else if (name === "cordial_site_take_rate")
        data = (
          await db.query<{ v: unknown }>("SELECT cordial_site_take_rate($1,$2,$3) v", [
            input._bucket,
            input._limit,
            input._seconds,
          ])
        ).rows[0].v;
      else if (name === "cordial_site_submit_lead")
        data = (
          await db.query<{ v: unknown }>("SELECT cordial_site_submit_lead($1,$2) v", [
            JSON.stringify(input._lead),
            input._fingerprint,
          ])
        ).rows[0].v;
      else throw Error("Unsupported test RPC");
    } else {
      const table = url.pathname.split("/").at(-1)!;
      const allowed = tables[table];
      if (!allowed) throw Error("Unsupported test table");
      const columns = (url.searchParams.get("select") ?? "").split(",");
      if (columns.some((c) => !allowed.includes(c))) throw Error("Column not allowed");
      const where: string[] = [],
        values: unknown[] = [];
      for (const [key, value] of url.searchParams) {
        if (!allowed.includes(key)) continue;
        const op = value.slice(0, value.indexOf(".")),
          v = value.slice(value.indexOf(".") + 1);
        if (!["eq", "gt"].includes(op)) throw Error("Unsupported filter");
        values.push(v);
        where.push(`${key}${op === "eq" ? "=" : ">"}$${values.length}`);
      }
      const order = (url.searchParams.get("order") ?? "")
        .split(",")
        .filter(Boolean)
        .map((term) => {
          const [key, dir] = term.split(".");
          if (!allowed.includes(key)) throw Error("Bad order");
          return `${key} ${dir === "desc" ? "DESC" : "ASC"}`;
        });
      data = (
        await db.query(
          `SELECT ${columns.join(",")} FROM ${table}${where.length ? " WHERE " + where.join(" AND ") : ""}${order.length ? " ORDER BY " + order.join(",") : ""} LIMIT ${Math.min(1000, Number(url.searchParams.get("limit") ?? 1000))}`,
          values,
        )
      ).rows;
      if (req.headers.accept?.includes("vnd.pgrst.object")) {
        if ((data as unknown[]).length === 0) {
          res.writeHead(406);
          res.end(JSON.stringify({ code: "PGRST116", details: "The result contains 0 rows" }));
          return;
        }
        data = (data as unknown[])[0];
      }
    }
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ message: error instanceof Error ? error.message : "Local QA error" }));
  }
}).listen(5190, "127.0.0.1");
