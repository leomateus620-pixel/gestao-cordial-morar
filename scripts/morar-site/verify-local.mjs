// Explicit loopback-only HTTP validation. Only isolated QA data is mutated
// (withdraw/restore and an optional synthetic contact; never commercial triage).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

if (process.env.QAMORAR_LOCAL_QA !== "true")
  throw Error("Set QAMORAR_LOCAL_QA=true for isolated HTTP verification.");
const origin = "http://127.0.0.1:5188";
const adapter = "http://127.0.0.1:5192";
const root = ".local/morar-site-audit";
const sample = JSON.parse(await readFile(`${root}/qa-sample.json`, "utf8"));
const runtime = JSON.parse(await readFile(`${root}/qa-runtime-report.json`, "utf8"));
const publications = JSON.parse(await readFile(`${root}/qa-publication-map.json`, "utf8"));
const canonical = new Map(sample.properties.map((p) => [p.id, p]));
const published = new Map(publications.map((p) => [p.public_id, p]));
const representativeIds = new Set(runtime.representatives.map((p) => p.publicId));
const results = [];
const report = {
  localOnly: true,
  startedAt: new Date().toISOString(),
  origin,
  adapter,
  notice:
    "Real read-only metadata in isolated PGlite; approval/withdrawal/restore are local test actions only. No production publication or lead submission.",
  checks: results,
};
// Keep a failed run as restricted evidence before replacing the latest report.
// A retry must not silently erase a failure or change existing local contacts.
try {
  const previousText = await readFile(`${root}/qa-http-report.json`, "utf8");
  const previous = JSON.parse(previousText);
  if (previous.passed === false) {
    const stamp = String(previous.finishedAt ?? previous.startedAt ?? Date.now()).replace(
      /[^0-9A-Za-z-]/g,
      "-",
    );
    const archive = `${root}/qa-http-report.failed-${stamp}.json`;
    try {
      await writeFile(archive, previousText, { flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    report.previousFailedReport = archive;
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const apiKey = "morar-local-test-only";
async function request(path, { expected = 200, ...options } = {}) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000), ...options });
  const text = await response.text();
  assert.equal(
    response.status,
    expected,
    `${path}: unexpected HTTP status (${text.slice(0, 120)})`,
  );
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.ok(
    response.headers.get("Cache-Control")?.includes("no-store") ||
      response.headers.get("Content-Type")?.startsWith("image/"),
  );
  return { response, text };
}
async function api(resource, input, brand = "morar", expected = 200) {
  const { text } = await request(
    `/api/${brand}-site/${resource}?input=${encodeURIComponent(JSON.stringify(input))}`,
    { expected },
  );
  return JSON.parse(text);
}
async function control(action, publicId) {
  const response = await fetch(adapter + "/__qa/control", {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ action, publicId, brand: "morar" }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
function privacy(value) {
  const forbidden =
    /^(?:proprietario.*|owner.*|codigo_cordial|codigo_morar|codigoCordial|codigoMorar|source_property_id|property_id|image_id|storage_path|processed_storage_path|thumbnail_storage_path|observacao_imovel|outras_informacoes|localizacao_maps_url|latitude|longitude|commission|comissao|morar_authorized|availability_confirmed|reviewed_content_hash|access_token|refresh_token)$/i;
  function inspect(node) {
    if (node === null || typeof node !== "object") return;
    for (const [key, nested] of Object.entries(node)) {
      assert.ok(!forbidden.test(key), `Forbidden field ${key}`);
      inspect(nested);
    }
  }
  inspect(value);
  const serialized = JSON.stringify(value);
  for (const id of canonical.keys())
    assert.ok(!serialized.includes(id), "Canonical internal property ID leaked");
  for (const image of sample.images)
    assert.ok(!serialized.includes(image.id), "Canonical internal image ID leaked");
}
function publicItem(item) {
  privacy(item);
  const own = published.get(item.id);
  assert.ok(own, "Listing does not belong to the Morar owned channel");
  const source = canonical.get(own.property_id);
  assert.equal(item.reference, own.public_reference);
  assert.equal(item.operation, source.operacao);
  assert.equal(item.type, source.tipo);
  if (source.exibir_endereco_site !== "sim") assert.equal(item.address, null);
  if (source.valor_modo !== "fixo" || source.valor == null) assert.equal(item.price, null);
  assert.equal(
    item.areas.util,
    null,
    "Unknown useful-area unit must remain omitted in this local approval",
  );
  for (const [publicKey, field] of [
    ["total", "area_total"],
    ["construida", "area_construida"],
    ["terreno", "area_terreno"],
  ])
    if (!source[`${field}_unidade`]) assert.equal(item.areas[publicKey], null);
  const images = sample.images.filter(
    (i) => i.property_id === own.property_id && i.pending_remote_delete !== true,
  );
  assert.equal(item.photoCount, images.length);
  assert.equal(item.cover.position, 0);
}
function normalizeProse(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
async function check(name, run) {
  const start = performance.now();
  try {
    const evidence = await run();
    results.push({ name, passed: true, ms: Math.round(performance.now() - start), evidence });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    throw error;
  }
}

try {
  await check("SSR, brand, administrative isolation and staging headers", async () => {
    const pages = [];
    for (const path of [
      "/site-morar",
      "/site-morar/buscar",
      "/site-morar/sobre",
      "/site-morar/contato",
      "/site-morar/bairros",
      "/site-morar/noticias",
      "/site-morar/financiamento",
      "/site-morar/correspondente",
      "/site",
    ]) {
      const { text } = await request(path);
      const title = text.match(/<title>([\s\S]*?)<\/title>/)?.[1];
      assert.ok(title?.includes(path === "/site" ? "Cordial" : "Morar"));
      assert.ok(
        !/data-sidebar=|data-slot="sidebar"|"access_token"\s*:|"refresh_token"\s*:|"session"\s*:|"proprietario_nome"\s*:|"localizacao_maps_url"\s*:/i.test(
          text,
        ),
        "Administrative/session/internal data in public SSR",
      );
      const resources = [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(
        (match) => match[1],
      );
      assert.ok(
        !resources.some((url) =>
          /imobibrasil|cordialimoveis\.com|imobiliariamorarimoveis\.com\.br/i.test(url),
        ),
        "An old-provider URL is used as a request resource",
      );
      pages.push({ path, title, SSR: true, oldProviderResources: 0 });
    }
    return {
      pages,
      fontBoundary: "HTTP does not establish the computed browser font; that is a browser check.",
    };
  });
  const all = [];
  await check(
    "Complete server pagination, object identity, privacy, prices, areas and photo metadata",
    async () => {
      const ids = new Set();
      let total,
        pages = 0;
      for (let pagina = 1; ; pagina++) {
        const page = await api("properties", { pagina });
        assert.equal(page.total, sample.properties.length);
        assert.equal(page.page, pagina);
        assert.equal(page.pageSize, 12);
        total = page.total;
        pages++;
        for (const item of page.items) {
          publicItem(item);
          assert.ok(!ids.has(item.id), "Duplicate pagination identity");
          ids.add(item.id);
          all.push(item);
        }
        if (page.items.length < 12) break;
      }
      assert.equal(ids.size, total);
      return {
        pages,
        total,
        distinct: ids.size,
        imageMetadata: all.reduce((n, p) => n + p.photoCount, 0),
      };
    },
  );
  await check("Brand counts, reference and object scope stay separate", async () => {
    const [morar, cordial] = await Promise.all([
      api("bootstrap", null),
      api("bootstrap", null, "cordial"),
    ]);
    assert.equal(morar.available, true);
    assert.equal(cordial.available, true);
    assert.equal(morar.facets.total, runtime.counts.morar);
    assert.equal(cordial.facets.total, runtime.counts.cordial);
    privacy(morar);
    privacy(cordial);
    const cordialPage = await api("properties", {}, "cordial");
    privacy(cordialPage);
    for (const item of cordialPage.items) {
      assert.ok(!published.has(item.id));
      assert.equal(await api("detail", item.id), null);
      assert.equal(await api("detail-state", item.id), "missing");
    }
    assert.equal(await api("detail", runtime.representatives[0].publicId, "cordial"), null);
    const attemptedOverride = await api("properties", {
      brand: "cordial",
      namespace: "cordial_site",
    });
    assert.equal(attemptedOverride.total, runtime.counts.morar);
    return {
      morar: morar.facets.total,
      cordial: cordial.facets.total,
      crossBrandObjects: "unavailable",
      visitorNamespaceOverride: "ignored",
    };
  });
  await check(
    "Combined rental/reference/location/rooms/price/photo filters and null semantics",
    async () => {
      const representative = runtime.representatives.find((p) => p.kind === "rental_house");
      const property = canonical.get(representative.propertyId);
      const filters = {
        finalidade: "aluguel",
        tipo: "Casa",
        referencia: representative.reference,
        exata: "sim",
        fotos: "sim",
      };
      if (property.cidade && property.cidade !== "0") filters.cidade = property.cidade;
      if (property.bairro && property.bairro !== "0") filters.bairro = property.bairro;
      if (property.dormitorios != null) {
        filters.dormitorios = property.dormitorios;
        filters.contagem = "exata";
      }
      if (property.valor_modo === "fixo" && property.valor != null) {
        filters.precoMin = property.valor;
        filters.precoMax = property.valor;
      }
      const combined = await api("properties", filters);
      assert.equal(combined.total, 1);
      assert.equal(combined.items[0].id, representative.publicId);
      assert.equal(
        (await api("properties", { finalidade: "aluguel" })).total,
        all.filter((p) => p.operation === "aluguel").length,
      );
      assert.equal((await api("properties", { fotos: "nao" })).total, 0);
      assert.equal((await api("properties", { referencia: "%", exata: "nao" })).total, 0);
      assert.equal((await api("properties", { cidade: "QA-no-city-" + randomUUID() })).total, 0);
      assert.equal(
        (await api("properties", { valorModo: "consulte" })).total,
        all.filter((p) => p.priceMode === "consulte").length,
      );
      assert.equal(
        (
          await api("properties", {
            referencia: representative.reference,
            areaTipo: "util",
            areaMin: 1,
          })
        ).total,
        0,
      );
      const empty = await api("properties", { referencia: representative.reference, tipo: "" });
      assert.equal(empty.total, 1);
      for (const input of [
        { pagina: 0 },
        { precoMin: 100, precoMax: 50 },
        { dormitorios: 1.5 },
        { areaMin: -1 },
        { finalidade: "invalid" },
      ])
        await api("properties", input, "morar", 400);
      return {
        reference: representative.reference,
        combinedResults: combined.total,
        rentalCount: all.filter((p) => p.operation === "aluguel").length,
        invalidCases: 5,
      };
    },
  );
  await check(
    "Every representative detail preserves gallery quantity, order and cover",
    async () => {
      const galleries = [];
      for (const representative of runtime.representatives) {
        const detail = await api("detail", representative.publicId);
        publicItem(detail);
        assert.equal(detail.images.length, detail.photoCount);
        assert.deepEqual(
          detail.images.map((i) => i.position),
          sample.images
            .filter(
              (i) =>
                i.property_id === representative.propertyId && i.pending_remote_delete !== true,
            )
            .map((i) => i.position)
            .sort((a, b) => a - b),
        );
        assert.equal(detail.images[0].id, detail.cover.id);
        const { text } = await request(`/site-morar/imovel/${representative.publicId}`);
        assert.ok(text.includes(representative.reference));
        galleries.push({
          kind: representative.kind,
          reference: representative.reference,
          images: detail.images.length,
        });
      }
      return galleries;
    },
  );
  await check(
    "Hidden canonical streets in imported public prose are omitted before JSON/SSR/filtering",
    async () => {
      const cases = [];
      for (const own of publications) {
        const source = canonical.get(own.property_id);
        const street = normalizeProse(source.logradouro);
        if (source.exibir_endereco_site === "sim" || !street || street === "0") continue;
        const hiddenDescription = normalizeProse(source.descricao_imovel).includes(street);
        const hiddenFeatures = (source.caracteristicas ?? []).filter((f) =>
          normalizeProse(f).includes(street),
        );
        if (!hiddenDescription && !hiddenFeatures.length) continue;
        const detail = await api("detail", own.public_id);
        if (hiddenDescription) assert.equal(detail.description, "");
        assert.ok(!normalizeProse(detail.description).includes(street));
        assert.ok(!detail.features.some((f) => normalizeProse(f).includes(street)));
        const queried = await api("properties", { q: source.logradouro });
        const matchesAllowedLocation = (item) =>
          [item.type, item.city, item.district]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(source.logradouro.toLowerCase());
        assert.ok(
          queried.items.every(matchesAllowedLocation),
          "Query matched private prose/street rather than a public type/city/district",
        );
        if (!matchesAllowedLocation(detail))
          assert.ok(!queried.items.some((item) => item.id === own.public_id));
        const { text } = await request(`/site-morar/imovel/${own.public_id}`);
        const overlapsPublicLocation = all.some((item) =>
          normalizeProse([item.type, item.city, item.district].filter(Boolean).join(" ")).includes(
            street,
          ),
        );
        if (!overlapsPublicLocation)
          assert.ok(
            !normalizeProse(text).includes(street),
            "Hidden street leaked into SSR/SEO/hydration",
          );
        else if (hiddenDescription)
          assert.ok(
            !normalizeProse(text).includes(normalizeProse(source.descricao_imovel)),
            "Original private prose leaked into SSR/SEO/hydration",
          );
        cases.push({
          propertyId: source.id,
          publicId: own.public_id,
          reference: own.public_reference,
          reason: "hidden canonical street in imported prose",
          descriptionOmitted: hiddenDescription,
          featuresOmitted: hiddenFeatures.length,
          streetNameAlsoPublicLocation: overlapsPublicLocation,
          canonicalChanged: false,
        });
      }
      await writeFile(
        `${root}/qa-private-content-review.json`,
        JSON.stringify({ restricted: true, cases }, null, 2),
      );
      return {
        cases: cases.length,
        canonicalChanged: false,
        publicText:
          "omitted before public projection; editorial correction remains optional in Gestão",
      };
    },
  );
  await check("Staging sitemap/robots, malformed and unknown objects", async () => {
    const { text } = await request("/site-morar/robots.txt");
    assert.match(text, /Disallow: \/\s*/);
    await request("/api/morar-site/sitemap.xml", { expected: 404 });
    await request("/site-morar/sitemap.xml", { expected: 404 });
    assert.equal(await api("detail", randomUUID()), null);
    assert.equal(await api("detail", "invalid-uuid"), null);
    await request(`/site-morar/imovel/${randomUUID()}`, { expected: 404 });
    await request(`/api/morar-site/media/${randomUUID()}/${"a".repeat(32)}/card`, {
      expected: 404,
    });
    await request("/api/morar-site/media/invalid-id/invalid-version/card", { expected: 404 });
    return {
      sitemap: "404 during staging",
      robots: "Disallow /",
      unknownHTML: 404,
      unknownMedia: 404,
    };
  });
  await check(
    "Withdrawal is immediate in HTML, JSON, counts and media; restore is isolated",
    async () => {
      const chosen = all.find((p) => !representativeIds.has(p.id));
      const mediaPath = `/api/morar-site/media/${chosen.cover.id}/${chosen.cover.version}/card`;
      const before = await request(mediaPath);
      assert.equal(before.response.headers.get("Content-Type"), "image/jpeg");
      assert.match(before.response.headers.get("Cache-Control"), /max-age=30/);
      let withdrawn = false;
      try {
        await control("withdraw", chosen.id);
        withdrawn = true;
        assert.equal(await api("detail", chosen.id), null);
        assert.equal(await api("detail-state", chosen.id), "withdrawn");
        assert.equal((await api("properties", {})).total, runtime.counts.morar - 1);
        await request(`/site-morar/imovel/${chosen.id}`, { expected: 410 });
        await request(mediaPath, { expected: 404 });
        assert.equal(
          await api("detail", canonical.get(published.get(chosen.id).property_id).id),
          null,
        );
      } finally {
        if (withdrawn) await control("restore", chosen.id);
      }
      assert.equal((await api("properties", {})).total, runtime.counts.morar);
      assert.equal((await api("detail", chosen.id)).id, chosen.id);
      return {
        withdrawnHTML: 410,
        withdrawnMedia: 404,
        postRestoreCount: runtime.counts.morar,
        object: "outside five representative galleries",
        cacheBoundarySeconds: 30,
      };
    },
  );
  await check("Six local catalogue HTTP latency observations", async () => {
    const times = [];
    for (let n = 0; n < 6; n++) {
      const start = performance.now();
      const page = await api("properties", { pagina: 1 });
      assert.equal(page.total, runtime.counts.morar);
      times.push(Math.round(performance.now() - start));
    }
    return {
      milliseconds: times,
      condition:
        "Warmed local Vite SSR/API + loopback Node/PGlite, 308 properties and 4623 image records; no network/CPU throttling. Not physical-device, field p75 or Core Web Vitals evidence.",
    };
  });
  // Opt-in creates one fresh synthetic contact in PGlite only. The same requestId
  // and then a new requestId are retried immediately within the SQL 10-minute
  // fingerprint window. Old UI contacts stay intact and are not a test precondition.
  if (process.env.QAMORAR_CONTACT_FIXTURE === "true")
    await check(
      "Fresh local contact persists and request/fingerprint retries add exactly one lead",
      async () => {
        const before = await control("status");
        assert.ok(Number.isInteger(before.morarLeads) && before.morarLeads >= 0);
        assert.equal(before.cordialLeads, 0);
        const started = performance.now();
        const firstRequestId = randomUUID();
        const fixture = {
          name: "QA local Morar",
          phone: "553000000000",
          message: `Teste isolado de persistência durável. Execução ${randomUUID()}. Não contactar.`,
          kind: "contato",
          consent: true,
          entryPath: "/site-morar/contato",
          email: "",
          website: "",
        };
        const steps = [];
        for (const [kind, requestId] of [
          ["first durable submission", firstRequestId],
          ["same requestId retry", firstRequestId],
          ["same fingerprint with a new requestId", randomUUID()],
        ]) {
          const submitted = await request("/api/morar-site/leads", {
            expected: 201,
            method: "POST",
            redirect: "error",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ ...fixture, requestId }),
          });
          assert.equal(JSON.parse(submitted.text).ok, true);
          const persisted = await control("status");
          assert.equal(persisted.morarLeads, before.morarLeads + 1, kind);
          assert.equal(persisted.cordialLeads, 0, kind);
          steps.push({ kind, status: 201, morar: persisted.morarLeads, cordial: 0 });
        }
        const elapsedMs = Math.round(performance.now() - started);
        assert.ok(elapsedMs < 10 * 60 * 1000, "Fingerprint retries exceeded the SQL window");
        return {
          localOnly: true,
          before: { morar: before.morarLeads, cordial: 0 },
          after: { morar: before.morarLeads + 1, cordial: 0 },
          added: 1,
          steps,
          elapsedMs,
          fingerprintWindowMs: 10 * 60 * 1000,
          fingerprintScope:
            "unique message per run; immediate requestId/fingerprint retries; existing contacts preserved; no notification or commercial triage",
        };
      },
    );
  report.passed = results.every((r) => r.passed);
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${root}/qa-http-report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: report.passed,
      checks: results.length,
      report: `${root}/qa-http-report.json`,
      error: report.error,
    }),
  );
}
