// Reproducible HTTP-only laboratory. Never points at production or imports credentials.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

if (process.env.CORDIAL_LOCAL_QA !== "true") throw Error("Only isolated local QA is supported.");
const before = "http://127.0.0.1:5174",
  after = "http://127.0.0.1:5173";
const qa = "http://127.0.0.1:5190";
const repetitions = 5;
const outputPath =
  process.env.CORDIAL_BENCHMARK_OUTPUT ?? ".local/cordial-experience/http-benchmark.json";
if (!/^\.local\/cordial-experience\/[a-z0-9-]+\.json$/.test(outputPath))
  throw Error("Keep local QA reports in .local/cordial-experience.");
function codeSnapshot() {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "-m",
      "-o",
      "--exclude-standard",
      "--",
      "src",
      "supabase/migrations",
      "drizzle/migrations",
      "scripts/cordial-site",
      "tests/cordial-site",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(path);
    try {
      hash.update(readFileSync(path));
    } catch {
      hash.update("deleted");
    }
  }
  return { revision, changedFilesSha256: hash.digest("hex"), changedFileCount: files.length };
}
const startCode = codeSnapshot();
type Sample = { headersMs: number | null; totalMs: number; bytes: number; status: number };
type Series = { before: Sample[]; after: Sample[] };
async function control(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(`${qa}/__qa/control`, {
    method: "POST",
    headers: { apikey: "cordial-local-test-only", "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  assert.equal(response.status, 200, "Isolated QA control must be available");
  return response.json();
}
const resource = (origin: string, name: string, input: unknown) =>
  `${origin}/api/cordial-site/${name}?${new URLSearchParams({ input: JSON.stringify(input) })}`;
async function measured(url: string): Promise<Sample> {
  const start = performance.now();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  const headersMs = performance.now() - start;
  const bytes = (await response.arrayBuffer()).byteLength;
  return { headersMs, totalMs: performance.now() - start, bytes, status: response.status };
}
async function json(origin: string, name: string, input: unknown) {
  const response = await fetch(resource(origin, name, input), { cache: "no-store" });
  assert.equal(response.status, 200, `${origin} ${name} must be available`);
  return response.json();
}
const round = (n: number) => Math.round(n * 100) / 100;
function distribution(samples: Sample[]) {
  const values = samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
  const headers = samples
    .map((sample) => sample.headersMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  return {
    medianMs: round(values[Math.floor(values.length / 2)]),
    minMs: round(values[0]),
    maxMs: round(values.at(-1)!),
    medianHeadersMs: headers.length ? round(headers[Math.floor(headers.length / 2)]) : null,
    bytes: [...new Set(samples.map((sample) => sample.bytes))],
    statuses: [...new Set(samples.map((sample) => sample.status))],
  };
}
const catalog = await json(after, "properties", {});
assert.ok(catalog.items.length >= 5, "Five eligible fixture properties are required");
const ids = catalog.items.slice(0, 5).map((item: { id: string }) => item.id);
const property = catalog.items.find((item: { cover: unknown }) => item.cover);
assert.ok(property?.cover, "An authorized fixture photograph is required");
const imagePath = `/api/cordial-site/media/${property.cover.id}/${property.cover.version}/card`;
const probes: Record<string, unknown> = {};
const count = await json(after, "count", {}),
  facets = await json(after, "facets", {});
assert.equal(count.total, catalog.total);
assert.equal(facets.total, catalog.total);
const summaries = await json(after, "summaries", ids),
  gallery = await json(after, "gallery", property.id);
assert.deepEqual(
  summaries.items.map((item: { id: string }) => item.id),
  ids,
);
assert.deepEqual(summaries.missingIds, []);
assert.ok(gallery.some((image: { id: string }) => image.id === property.cover.id));
assert.ok(catalog.items.every((item: { address: string | null }) => item.address === null));
probes.reads = {
  catalogCount: catalog.total,
  countEqual: true,
  facetCountEqual: true,
  summariesOrdered: true,
  galleryAuthorized: true,
  exactAddressAbsent: true,
};

const pageSeries: Record<string, Series> = {};
for (const [label, path] of Object.entries({
  home: "/site",
  search: "/site/buscar",
  detail: `/site/imovel/${property.id}`,
  favoritesShell: "/site/favoritos",
})) {
  // Warm the Vite modules in both versions. This is not a cold server-start comparison.
  await measured(before + path);
  await measured(after + path);
  const series: Series = { before: [], after: [] };
  for (let run = 0; run < repetitions; run++) {
    series.before.push(await measured(before + path));
    series.after.push(await measured(after + path));
  }
  pageSeries[label] = series;
}
const countSeries: Series = { before: [], after: [] };
for (let run = 0; run < repetitions; run++) {
  countSeries.before.push(await measured(resource(before, "properties", {})));
  countSeries.after.push(await measured(resource(after, "count", {})));
}
const favorites: Series = { before: [], after: [] };
for (let run = 0; run < repetitions; run++) {
  const start = performance.now();
  let bytes = 0;
  for (let offset = 0; offset < ids.length; offset += 4) {
    const responses = await Promise.all(
      ids.slice(offset, offset + 4).map((id: string) => measured(resource(before, "detail", id))),
    );
    responses.forEach((response) => {
      assert.equal(response.status, 200);
      bytes += response.bytes;
    });
  }
  favorites.before.push({
    headersMs: null,
    totalMs: performance.now() - start,
    bytes,
    status: 200,
  });
  favorites.after.push(await measured(resource(after, "summaries", ids)));
}
const media: Record<string, Series> = {
  coldDerivative: { before: [], after: [] },
  warmDerivative: { before: [], after: [] },
};
await measured(before + imagePath);
await measured(after + imagePath);
await control("reset-metrics");
for (let run = 0; run < repetitions; run++) {
  await control("clear-derivatives");
  media.coldDerivative.before.push(await measured(before + imagePath));
  media.coldDerivative.after.push(await measured(after + imagePath));
  media.warmDerivative.before.push(await measured(before + imagePath));
  media.warmDerivative.after.push(await measured(after + imagePath));
}
const mediaCounters = await control("status");
await control("withdraw", { publicId: property.id });
try {
  const withdrawnMedia = await measured(after + imagePath);
  assert.equal(withdrawnMedia.status, 404, "A warm private derivative must not bypass withdrawal");
  assert.equal(await json(after, "detail", property.id), null);
  assert.deepEqual(await json(after, "gallery", property.id), []);
  const withdrawnSummary = await json(after, "summaries", [property.id]);
  assert.deepEqual(withdrawnSummary.items, []);
  assert.deepEqual(withdrawnSummary.missingIds, [property.id]);
  probes.withdrawal = {
    warmMediaStatus: 404,
    detailRemoved: true,
    galleryRemoved: true,
    summaryMarkedMissing: true,
  };
} finally {
  await control("restore", { publicId: property.id });
}

const summarize = (series: Series) => ({
  before: distribution(series.before),
  after: distribution(series.after),
});
const summary = {
  pages: Object.fromEntries(
    Object.entries(pageSeries).map(([key, series]) => [key, summarize(series)]),
  ),
  countPreview: summarize(countSeries),
  favoritesFive: summarize(favorites),
  media: Object.fromEntries(Object.entries(media).map(([key, series]) => [key, summarize(series)])),
};
const endCode = codeSnapshot();
const report = {
  generatedAt: new Date().toISOString(),
  repetitions,
  versions: {
    before: "Historical HEAD archive served on 5174",
    after: "Current working tree served on 5173",
  },
  code: {
    start: startCode,
    end: endCode,
    sourceStable:
      startCode.revision === endCode.revision &&
      startCode.changedFilesSha256 === endCode.changedFilesSha256,
  },
  conditions: {
    runtime: process.version,
    client: "Node fetch on same Windows host; loopback HTTP",
    viewport: "Not applicable to HTTP-only checks",
    cpu: {
      model: cpus()[0]?.model,
      logicalCores: cpus().length,
      memoryGiB: round(totalmem() / 1024 ** 3),
      emulation: "None; shared local host",
    },
    network: "Loopback; no throttling",
    applicationModules: "Warmed before recorded repetitions",
    browserCache: "Absent (Node fetch no-store)",
    derivativeCache:
      "Explicitly cleared before each coldDerivative pair; populated for each warmDerivative pair",
    originalFileSystemCache: "Uncontrolled operating-system filesystem cache",
    serverState:
      "Two existing Vite development servers and the same isolated PGlite backend; not restarted",
    limitations: [
      "HTTP timings and bytes do not measure image paint, LCP, INP, CLS, hydration or mobile devices.",
      "Favorites shell SSR does not include its browser-side data loading; favoritesFive separately measures that data workflow.",
      "The five-request favorites workflow has no single headers/TTFB measurement; its medianHeadersMs is null, not zero.",
      "No production or field-p75 claim follows from these local development results.",
    ],
  },
  probes,
  summary,
  raw: { pages: pageSeries, countPreview: countSeries, favoritesFive: favorites, media },
  mediaCounters,
};
await writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputPath, probes, summary, mediaCounters }, null, 2));
