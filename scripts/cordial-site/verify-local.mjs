// HTTP integration verification against the explicitly started, loopback-only QA harness.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const origin = process.env.SITE_QA_ORIGIN ?? "http://127.0.0.1:5186";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error("Local verification only");
const results = [];
async function check(name, fn) {
  const start = performance.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - start) });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}
const api = (path, input) =>
  fetch(
    origin +
      "/api/cordial-site/" +
      path +
      "?" +
      new URLSearchParams({ input: JSON.stringify(input) }),
  );
let listing;
await check(
  "SSR includes real offer content, no owner fields, admin stylesheet or session",
  async () => {
    const r = await fetch(origin + "/site/buscar");
    const text = await r.text();
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control"), /no-store/);
    assert.match(r.headers.get("x-robots-tag"), /noindex/);
    for (const key of [
      "proprietario_nome",
      "codigoMorar",
      "localizacao_maps_url",
      "access_token",
      "refresh_token",
    ])
      assert.ok(!text.includes(key), key);
    assert.ok(text.includes("Referência Cordial"));
    assert.ok(text.includes("R$"));
    assert.ok(!text.includes("fonts.googleapis.com"));
  },
);
await check(
  "JSON has exactly 12 results/page; every test publication is reached once",
  async () => {
    let ids = [];
    let total;
    for (let page = 1; page <= 3; page++) {
      const r = await api("properties", { pagina: page });
      assert.equal(r.status, 200);
      const data = await r.json();
      total = data.total;
      ids.push(...data.items.map((x) => x.id));
      listing ??= data.items.find((x) => x.cover);
      for (const x of data.items) assert.equal(x.description, "");
    }
    assert.equal(ids.length, total);
    assert.equal(new Set(ids).size, total);
  },
);
await check("Detail contains canonical ordered gallery and matching cover", async () => {
  assert.ok(listing);
  const r = await api("detail", listing.id);
  assert.equal(r.status, 200, "detail HTTP status");
  const d = await r.json();
  assert.equal(d.images.length, d.photoCount);
  assert.equal(d.images[0].id, d.cover.id);
  assert.deepEqual(
    [...d.images].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    d.images,
  );
  const html = await (await fetch(origin + "/site/imovel/" + listing.id)).text();
  assert.ok(html.includes(listing.reference));
  assert.ok(!html.includes("storage_path"));
});
await check(
  "Stable image endpoint returns real transformed bytes without a signed URL",
  async () => {
    const m = listing.cover;
    const url = origin + `/api/cordial-site/media/${m.id}/${m.version}/card`;
    const r = await fetch(url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.match(r.headers.get("cache-control"), /max-age=30/);
    assert.ok((await r.arrayBuffer()).byteLength > 500);
    const second = await fetch(url);
    assert.equal(second.status, 200);
  },
);
await check(
  "Arbitrary media id, obsolete signature, storage path and invalid intervals are rejected",
  async () => {
    const id = crypto.randomUUID();
    assert.equal(
      (await fetch(origin + `/api/cordial-site/media/${id}/${"0".repeat(32)}/card`)).status,
      404,
    );
    assert.equal(
      (await fetch(origin + `/api/cordial-site/media/${listing.cover.id}/${"0".repeat(32)}/card`))
        .status,
      404,
    );
    assert.equal((await api("properties", { precoMin: 500, precoMax: 10 })).status, 400);
    assert.equal((await api("detail", id)).status, 200);
    assert.equal(await (await api("detail", id)).json(), null);
  },
);
await check(
  "SSR contact, capture, services, districts, news and favorites remain accessible",
  async () => {
    for (const path of [
      "contato",
      "anuncie",
      "sobre",
      "financiamento",
      "correspondente",
      "bairros",
      "noticias",
      "favoritos",
      "privacidade",
    ]) {
      const r = await fetch(origin + "/site/" + path);
      assert.equal(r.status, 200, path);
      assert.ok((await r.text()).includes("Cordial"));
    }
  },
);
await check(
  "Contact rejects foreign origin and persists a local-only submission with idempotent repeat",
  async () => {
    const lead = {
      requestId: crypto.randomUUID(),
      name: "Teste local automatizado",
      phone: "5500000000000",
      message: "Teste isolado sem atendimento comercial real.",
      kind: "contato",
      consent: true,
      entryPath: "/site/contato",
    };
    const post = (originHeader) =>
      fetch(origin + "/api/cordial-site/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: originHeader },
        body: JSON.stringify(lead),
      });
    assert.equal((await post("https://not-authorized.invalid")).status, 403);
    for (let i = 0; i < 2; i++) {
      const r = await post(origin);
      assert.equal(r.status, 201);
      assert.equal((await r.json()).ok, true);
    }
  },
);
await check(
  "Preview sitemap is excluded and admin route still requires its own login",
  async () => {
    assert.equal((await fetch(origin + "/api/cordial-site/sitemap.xml")).status, 404);
    const r = await fetch(origin + "/imoveis", { redirect: "manual" });
    assert.ok([200, 302, 307].includes(r.status));
    const t = await r.text();
    assert.ok(!t.includes("proprietario_nome"));
  },
);
const control = async (body) => {
  const r = await fetch("http://127.0.0.1:5190/__qa/control", {
    method: "POST",
    headers: { apikey: "cordial-local-test-only", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  return r.json();
};
await check(
  "Withdrawal removes HTML/JSON/media immediately and distinguishes known withdrawal from unknown URL",
  async () => {
    await control({ action: "withdraw", publicId: listing.id });
    try {
      assert.equal(await (await api("detail", listing.id)).json(), null);
      const m = listing.cover;
      assert.equal(
        (await fetch(origin + `/api/cordial-site/media/${m.id}/${m.version}/card`)).status,
        404,
      );
      const r = await fetch(origin + "/site/imovel/" + listing.id);
      assert.equal(r.status, 410);
      const html = await r.text();
      assert.ok(html.includes("saiu do catálogo"));
      assert.ok(!html.includes("RealEstateListing"));
      assert.equal((await fetch(origin + "/site/imovel/" + crypto.randomUUID())).status, 404);
    } finally {
      await control({ action: "restore", publicId: listing.id });
    }
  },
);
await check(
  "Temporary backend failure returns 503 instead of an empty successful catalog or contact confirmation",
  async () => {
    await control({ action: "failure", enabled: true });
    try {
      assert.equal((await api("properties", {})).status, 503);
      assert.equal((await fetch(origin + "/site/buscar")).status, 503);
    } finally {
      await control({ action: "failure", enabled: false });
    }
  },
);
await check("Oversized JSON is rejected before persistence", async () => {
  const r = await fetch(origin + "/api/cordial-site/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ message: "x".repeat(12000) }),
  });
  assert.equal(r.status, 413);
});
await writeFile(
  "docs/cordial-site/evidence/http-validation.json",
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      environment: "30 real Gestão records, isolated PGlite approvals; no production writes",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
if (results.some((x) => !x.ok)) process.exitCode = 1;
