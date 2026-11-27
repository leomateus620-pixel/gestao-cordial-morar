/** Local only. Fixture auth/catalog/lead transport; real UI, HTTP intake and audience SQL. */
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, request, type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import type { PublicProperty } from "../../src/lib/cordial-site/contract";

const built = process.argv.includes("--built");
const noticeOnly = process.argv.includes("--notice-only");
const proxyPort = noticeOnly ? 5218 : built ? 5208 : 5198;
const vitePort = proxyPort - 1;
const storagePort = proxyPort + 1;
const apiKey = "qa-audience-local-only";
const serviceKey = "qa-audience-server-only";
const policy = "qa-v1";
const supabaseUrl = `http://127.0.0.1:${storagePort}`;
const brands = ["cordial", "morar"] as const;
const hostFor = (brand: (typeof brands)[number]) => `${brand}.localhost:${proxyPort}`;
const uuid = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
const users = { admin: uuid(1), corretor: uuid(2) };
const properties = Object.fromEntries(
  brands.map((brand, brandIndex) => [
    brand,
    ["Centro", "Jardim"].map(
      (district, index): PublicProperty => ({
        id: uuid(100 + 10 * brandIndex + index),
        reference: `${brandIndex + 1}00${index + 1}`,
        operation: "venda",
        type: index === 0 ? "Casa" : "Apartamento",
        city: "Santa Rosa",
        district,
        state: "RS",
        address: null,
        price: index === 0 ? 427_000 : 385_000,
        priceMode: "fixo",
        bedrooms: 2,
        bathrooms: 1,
        suites: null,
        parking: 1,
        areas: { util: 88, total: 120, construida: null, terreno: null },
        furnished: null,
        exchange: null,
        financing: null,
        stage: null,
        featured: false,
        publishedAt: "2026-11-24T12:00:00Z",
        description: "Ficha fictícia de homologação de audiência.",
        features: [],
        cover: null,
        photoCount: 0,
      }),
    ),
  ]),
) as Record<(typeof brands)[number], PublicProperty[]>;

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create function public.is_meta_reviewer() returns boolean language sql as 'select false';
  create function public.is_atendimentos_viewer() returns boolean language sql as 'select false';
  create table public.cordial_site_documents (public_id uuid primary key, document jsonb);
  create table public.morar_site_documents (public_id uuid primary key, document jsonb);
  create view public.cordial_site_eligible as select public_id from public.cordial_site_documents;
  create view public.morar_site_eligible as select public_id from public.morar_site_documents;
`);
const migration = await readFile(
  new URL("../../drizzle/migrations/0116_site_audience.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
for (const brand of brands) {
  for (const item of properties[brand]) {
    await db.query(`insert into ${brand}_site_documents values ($1, $2)`, [item.id, item]);
  }
  await db.query("select public.site_audience_configure($1, 'qa', $2, true)", [brand, policy]);
}

const sessions = new Map<string, string>();
const leads = { cordial: new Set<string>(), morar: new Set<string>() };
let intakeUnavailable = false;
const jsonBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
};
const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const userFor = (id: string) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: id === users.admin ? "admin@example.test" : "corretor@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-11-24T12:00:00Z",
});
function authToken(id: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: id, exp, role: "authenticated" })}`;
  const token = `${body}.${createHmac("sha256", serviceKey).update(body).digest("base64url")}`;
  sessions.set(token, id);
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: token,
    user: userFor(id),
  };
}

const storage = createServer(async (req, res) => {
  const url = new URL(req.url!, supabaseUrl);
  const json = (data: unknown, status = 200) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-expose-headers": "content-range",
    });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === "OPTIONS") return json(null);
    if (url.pathname === "/__qa/audience") {
      const { rows } = await db.query(
        `select brand, kind, count(*)::int as total from site_audience.events group by 1,2 order by 1,2`,
      );
      return json({
        events: rows,
        persistedLeads: { cordial: leads.cordial.size, morar: leads.morar.size },
      });
    }
    if (url.pathname === "/__qa/availability" && req.method === "POST") {
      intakeUnavailable = (await jsonBody(req)).unavailable === true;
      return json({ unavailable: intakeUnavailable });
    }
    const authenticated = sessions.get(req.headers.authorization?.replace(/^Bearer /, "") ?? "");
    const service = req.headers.apikey === serviceKey;
    if (req.headers.apikey !== apiKey && !service) return json({}, 401);
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const { email, password } = await jsonBody(req);
      const role =
        email === "admin@example.test"
          ? "admin"
          : email === "corretor@example.test"
            ? "corretor"
            : null;
      return password === "audiencia-qa-local" && role
        ? json(authToken(users[role]))
        : json({ message: "Invalid login credentials" }, 400);
    }
    if (url.pathname === "/auth/v1/user")
      return authenticated ? json(userFor(authenticated)) : json({}, 401);
    const rpc = url.pathname.split("/").at(-1)!;
    if (url.pathname.startsWith("/rest/v1/rpc/site_audience_")) {
      if (intakeUnavailable && rpc === "site_audience_ingest") return json({}, 503);
      if (!service || !/^site_audience_(collection_status|ingest|report)$/.test(rpc))
        return json({}, 403);
      const input: Record<string, unknown> = await jsonBody(req);
      const args = Object.keys(input);
      if (!args.every((key) => /^p_[a-z_]+$/.test(key))) return json({}, 400);
      const sql = args.map((key, i) => `${key} => $${i + 1}`).join(", ");
      const { rows } = await db.query<{ value: unknown }>(
        `select public.${rpc}(${sql}) as value`,
        Object.values(input),
      );
      return json(rows[0]?.value ?? null);
    }
    const match = /(?:^\/rest\/v1\/(?:rpc\/)?)?(cordial|morar)_site_(\w+)$/.exec(url.pathname);
    if (match) {
      const brand = match[1] as (typeof brands)[number];
      const records = properties[brand];
      const single = req.headers.accept?.includes("vnd.pgrst.object");
      const input = req.method === "POST" ? await jsonBody(req) : {};
      const { f } = input;
      const filter = url.searchParams.get("public_id") ?? "";
      const ids = filter.startsWith("in.(")
        ? filter.slice(4, -1).split(",")
        : filter.startsWith("eq.")
          ? [filter.slice(3)]
          : null;
      const documents = records
        .filter((item) => !ids || ids.includes(item.id))
        .map((document) => ({ public_id: document.id, document }));
      switch (match[2]) {
        case "settings":
          return json({
            content: {
              privacy:
                noticeOnly && brand === "morar"
                  ? ""
                  : "Política fictícia deste ensaio em banco local.",
              whatsapp: "5500000000000",
            },
          });
        case "facets":
        case "filtered_facets":
          return json({ total: records.length, types: [], cities: [], districts: [], stages: [] });
        case "count":
          return json(records.length);
        case "search":
          return json({
            total: records.length,
            items: f?.pagina > 1 || f?.finalidade === "aluguel" ? [] : records,
          });
        case "documents":
          return json(single ? (documents[0] ?? null) : documents);
        case "eligible":
          return json(records.map((item) => ({ public_id: item.id })));
        case "take_rate":
          return json(true);
        case "submit_lead":
          leads[brand].add(input._lead.requestId);
          return json("received");
        case "leads": {
          const requestId = url.searchParams.get("request_id")?.replace(/^eq\./, "");
          const matches =
            requestId && leads[brand].has(requestId) ? [{ request_id: requestId }] : [];
          return json(single ? (matches[0] ?? null) : matches);
        }
        case "showcase_active":
          return json(null);
        default:
          return json([]);
      }
    }
    if (url.pathname === "/rest/v1/rpc/has_role" && authenticated) {
      const input = await jsonBody(req);
      return json(
        input._user_id === authenticated &&
          input._role === (authenticated === users.admin ? "admin" : "corretor"),
      );
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json(null);
    if (url.pathname === "/rest/v1/profiles" && authenticated)
      return json([
        {
          ...userFor(authenticated),
          nome: "Validação QA",
          iniciais: "QA",
          cargo: null,
        },
      ]);
    if (url.pathname === "/rest/v1/user_roles" && authenticated)
      return json([{ role: authenticated === users.admin ? "admin" : "corretor" }]);
    return json([]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local fixture error");
    return json({ message: "Local fixture error" }, 500);
  }
});

const proxy = createServer((req, res) => {
  const upstream = request(
    {
      host: "127.0.0.1",
      port: vitePort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, "cf-connecting-ip": "192.0.2.10" },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end("Aguardando Vite local.");
  });
  req.pipe(upstream);
});

const env = {
  ...process.env,
  SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_URL: supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: apiKey,
  VITE_SUPABASE_PUBLISHABLE_KEY: apiKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SITE_AUDIENCE_ENV: "qa",
  SITE_AUDIENCE_LOCAL_QA: "true",
  SITE_AUDIENCE_INGRESS_VERIFIED: "true",
  SITE_AUDIENCE_RATE_SECRET: "qa-only-audience-abuse-key-local-only",
  ...Object.fromEntries(
    brands.flatMap((brand) => {
      const name = brand.toUpperCase() + "_SITE";
      return [
        [`VITE_${name}_PUBLIC_HOST`, hostFor(brand)],
        [`${name}_ENV`, "preview"],
        [`${name}_RATE_SECRET`, "qa-local-catalog-only"],
        [`${name}_AUDIENCE_QA_HOST`, hostFor(brand)],
        [`${name}_AUDIENCE_POLICY_VERSION`, policy],
        [`${name}_AUDIENCE_UTM_PAIRS`, "qa:cpc"],
        [`${name}_AUDIENCE_CAMPAIGNS`, "acceptance"],
      ];
    }),
  ),
};
storage.listen(storagePort, "127.0.0.1");
proxy.listen(proxyPort, "127.0.0.1");
const spawnOptions = { env, stdio: "inherit" } as const;
const devArgs = [
  "run",
  "dev",
  "--config",
  "tests/site-audience/vite.config.ts",
  "--host",
  "127.0.0.1",
  "--port",
  String(vitePort),
  "--strictPort",
];
let app = built
  ? spawn("bun", ["run", "build", "--config", "tests/site-audience/vite.config.ts"], {
      ...spawnOptions,
      env: { ...env, NITRO_PRESET: "node-server" },
    })
  : spawn("bun", devArgs, spawnOptions);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    app.kill(signal);
    process.exit();
  });
app.once("exit", (status) => {
  if (!built || status !== 0) process.exit(status ?? 1);
  app = spawn("node", [".output/server/index.mjs"], {
    ...spawnOptions,
    env: { ...env, HOST: "127.0.0.1", PORT: String(vitePort) },
  });
  app.once("exit", (code) => process.exit(code ?? 1));
});
console.log(
  `QA isolado: ${brands.map((brand) => `http://${hostFor(brand)}`).join(" · ")} · Gestão http://localhost:${proxyPort}`,
);
