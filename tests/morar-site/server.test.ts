import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSiteRequest, mediaResponse } from "../../src/lib/cordial-site/http.server";
import { readSite, bootstrap } from "../../src/lib/cordial-site/service.server";
import { siteChannel, siteDefaultSettings } from "../../src/lib/cordial-site/channel.server";
import { encodeJpeg } from "../../src/lib/imoveis/watermark-purejs.server";
import {
  guardSiteRequest,
  requestSiteBrand,
  siteResponseHeaders,
} from "../../src/lib/cordial-site/request.server";

const morarId = "00000000-0000-4000-8000-000000000002";
const cordialId = "00000000-0000-4000-8000-000000000003";
const property = {
  id: morarId,
  reference: "3398",
  operation: "aluguel",
  type: "Casa",
  city: "Santa Rosa",
  district: "Centro",
  state: "RS",
  address: null,
  price: null,
  priceMode: "consulte",
  bedrooms: 2,
  bathrooms: 1,
  suites: null,
  parking: 0,
  areas: { util: null, total: null, construida: null, terreno: null },
  furnished: null,
  exchange: null,
  financing: null,
  stage: null,
  featured: true,
  publishedAt: "2026-10-04T12:00:00Z",
  description: "Casa com descrição real no teste isolado.",
  features: [],
  cover: null,
  photoCount: 0,
  proprietario_nome: "PRIVATE_OWNER",
  codigo_cordial: "PRIVATE_CORDIAL",
  localizacao_maps_url: "PRIVATE_MAP",
  internal_notes: "PRIVATE_NOTES",
};
test("server boundaries use a closed brand and isolate public data, settings and requests", async (t) => {
  const savedEnv = { ...process.env },
    savedFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "http://127.0.0.1:59999";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-only";
  process.env.MORAR_SITE_RATE_SECRET = "local-morar-rate-only";
  process.env.CORDIAL_SITE_RATE_SECRET = "local-cordial-rate-only";
  delete process.env.VITE_MORAR_SITE_PUBLIC_HOST;
  delete process.env.VITE_CORDIAL_SITE_PUBLIC_HOST;
  delete process.env.MORAR_SITE_CANONICAL_ORIGIN;
  delete process.env.CORDIAL_SITE_CANONICAL_ORIGIN;
  const requests: string[] = [];
  let available = true;
  let mediaMode: "absent" | "authorized" | "withdrawDuringDownload" = "absent";
  let mediaAuthorized = true;
  let mediaChecks = 0;
  const photo = encodeJpeg({ width: 1, height: 1, data: new Uint8Array([20, 30, 40, 255]) }, 80);
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    requests.push(url.pathname);
    if (!available) return Response.json({ message: "database unavailable" }, { status: 503 });
    if (url.pathname.startsWith("/storage/v1/object/")) {
      if (mediaMode === "withdrawDuringDownload") mediaAuthorized = false;
      return new Response(new Blob([photo], { type: "image/jpeg" }));
    }
    const name = url.pathname.split("/").at(-1)!;
    if (name.endsWith("take_rate")) return Response.json(true);
    if (name === "morar_site_search") return Response.json({ items: [property], total: 1 });
    if (name === "morar_site_facets")
      return Response.json({
        total: 1,
        types: [{ value: "Casa", count: 1, owner: "PRIVATE_FACET_OWNER" }],
        cities: [],
        districts: [],
        stages: [],
        coordinates: "PRIVATE_FACET_MAP",
      });
    if (name === "morar_site_settings")
      return Response.json({ content: { brand: "Morar Imóveis", whatsapp: "5555999021662" } });
    if (name === "morar_site_documents")
      return Response.json(
        url.searchParams.get("public_id") === `eq.${morarId}` ? { document: property } : null,
      );
    if (name === "morar_site_authorized_media") {
      if (url.searchParams.has("public_id")) return Response.json([]);
      mediaChecks++;
      return Response.json(
        mediaMode !== "absent" && mediaAuthorized && url.searchParams.get("id") === `eq.${morarId}`
          ? { id: morarId, storage_path: "test-only/approved.jpg", width: 1, height: 1 }
          : null,
      );
    }
    if (name === "morar_site_submit_lead") return Response.json("received");
    return Response.json({ message: "unexpected resource" }, { status: 400 });
  };
  try {
    await t.test("Morar JSON strips private columns and never queries Cordial", async () => {
      const data = await readSite("properties", {}, "morar");
      const serialized = JSON.stringify(data);
      for (const value of ["PRIVATE_OWNER", "PRIVATE_CORDIAL", "PRIVATE_MAP", "PRIVATE_NOTES"])
        assert.ok(!serialized.includes(value));
      assert.ok(requests.includes("/rest/v1/rpc/morar_site_search"));
      assert.ok(!requests.some((path) => path.includes("cordial_site")));
      const initial = await bootstrap("morar");
      assert.equal(initial.available, true);
      assert.ok(!JSON.stringify(initial).includes("PRIVATE_FACET"));
    });
    await t.test("IDs from another channel cannot resolve a Morar detail or media", async () => {
      assert.equal(await readSite("detail", cordialId, "morar"), null);
      assert.equal((await mediaResponse(cordialId, "a".repeat(32), "card", "morar")).status, 404);
      assert.equal(
        (await mediaResponse("../property-images/private", "a".repeat(32), "card", "morar")).status,
        404,
      );
      const detail = await readSite("detail", morarId, "morar");
      assert.ok(detail && !JSON.stringify(detail).includes("PRIVATE_"));
    });
    await t.test("brand fallback never inherits Cordial contacts", async () => {
      assert.equal(siteDefaultSettings("morar").brand, "Morar Imóveis");
      assert.equal(siteDefaultSettings("morar").whatsapp, "");
      assert.equal((await bootstrap("morar")).settings.whatsapp, "5555999021662");
      available = false;
      const result = await bootstrap("morar");
      assert.equal(result.available, false);
      assert.equal(result.settings.brand, "Morar Imóveis");
      assert.equal(result.settings.whatsapp, "");
      available = true;
    });
    await t.test(
      "media rechecks channel authorization after downloading and encoding",
      async () => {
        try {
          mediaMode = "authorized";
          mediaAuthorized = true;
          mediaChecks = 0;
          const authorized = await mediaResponse(morarId, "a".repeat(32), "card", "morar");
          assert.equal(authorized.status, 200);
          assert.equal(authorized.headers.get("content-type"), "image/jpeg");
          assert.equal(
            authorized.headers.get("cache-control"),
            "private, max-age=30, must-revalidate",
          );
          assert.equal(mediaChecks, 2);
          mediaMode = "withdrawDuringDownload";
          mediaAuthorized = true;
          mediaChecks = 0;
          const withdrawn = await mediaResponse(morarId, "a".repeat(32), "card", "morar");
          assert.equal(withdrawn.status, 404);
          assert.equal(withdrawn.headers.get("cache-control"), "no-store");
          assert.equal(mediaChecks, 2);
        } finally {
          mediaMode = "absent";
        }
      },
    );
    await t.test("HTTP validates namespace, payload and contact origin", async () => {
      const base = "http://127.0.0.1:5186";
      assert.equal(
        (await handleSiteRequest(new Request(`${base}/api/cordial-site/properties`), "morar"))
          .status,
        404,
      );
      assert.equal(
        (
          await handleSiteRequest(
            new Request(`${base}/api/morar-site/properties?input=%7B%22pagina%22%3A-1%7D`),
            "morar",
          )
        ).status,
        400,
      );
      const denied = await handleSiteRequest(
        new Request(`${base}/api/morar-site/leads`, {
          method: "POST",
          headers: { Origin: "https://foreign.example", "Content-Type": "application/json" },
          body: "{}",
        }),
        "morar",
      );
      assert.equal(denied.status, 403);
      const lead = {
        requestId: morarId,
        name: "Local Test",
        phone: "55999999999",
        message: "Contato apenas no teste isolado",
        kind: "contato",
        consent: true,
        entryPath: "/site-morar/contato",
      };
      const submitted = await handleSiteRequest(
        new Request(`${base}/api/morar-site/leads`, {
          method: "POST",
          headers: { Origin: base, "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        }),
        "morar",
      );
      assert.equal(submitted.status, 201);
      assert.ok(requests.includes("/rest/v1/rpc/morar_site_submit_lead"));
      assert.equal(submitted.headers.get("cache-control"), "no-store");
    });
    await t.test("public host blocks cross-brand and administrative APIs", async () => {
      process.env.VITE_MORAR_SITE_PUBLIC_HOST = "morar.example";
      assert.equal(requestSiteBrand(new Request("https://gestao.example/site-morar")), "morar");
      assert.equal(
        requestSiteBrand(new Request("https://gestao.example/site-morar-administracao")),
        null,
      );
      assert.equal(
        (await guardSiteRequest(new Request("https://morar.example/api/cordial-site/bootstrap")))
          ?.status,
        404,
      );
      assert.equal(
        (await guardSiteRequest(new Request("https://morar.example/_serverFn/private")))?.status,
        404,
      );
      assert.equal(
        (await guardSiteRequest(new Request("https://morar.example/site-administracao")))?.status,
        404,
      );
      assert.equal(siteResponseHeaders("morar")["X-Robots-Tag"], "noindex, nofollow");
    });
    await t.test("unknown brand cannot choose arbitrary database identifiers", () => {
      assert.throws(() => siteChannel("properties" as never));
    });
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
});
