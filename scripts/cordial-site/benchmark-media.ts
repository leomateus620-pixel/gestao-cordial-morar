/** CPU/derived-byte microbenchmark; not HTTP, field Web Vitals or production storage evidence. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import {
  decodeRaster,
  resizeRaster,
  encodeJpeg,
} from "../../src/lib/imoveis/watermark-purejs.server";
import {
  checksum,
  resolveDerivative,
  type DerivativeStore,
} from "../../src/lib/cordial-site/media-derivatives.server";
const input = process.argv[2];
if (!input)
  throw new Error(
    "Usage: tsx scripts/cordial-site/benchmark-media.ts <authorized-local-image> [output-folder]",
  );
const output = resolve(process.argv[3] ?? ".local/cordial-site-experience/media-benchmark");
await mkdir(output, { recursive: true });
const source = new Uint8Array(await readFile(input));
const type = source[0] === 0x89 && source[1] === 0x50 ? "image/png" : "image/jpeg";
const first = decodeRaster(source, type);
const transform = async () => {
  const photo = decodeRaster(source, type);
  const width = Math.min(960, photo.width);
  return encodeJpeg(
    width === photo.width
      ? photo
      : resizeRaster(photo, width, Math.max(1, Math.round((photo.height * width) / photo.width))),
    80,
  );
};
const store: DerivativeStore = {
  async read(key) {
    try {
      return {
        bytes: new Uint8Array(await readFile(`${output}/${key}.jpg`)),
        checksum: await readFile(`${output}/${key}.sha256`, "utf8"),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  claim: async () => "benchmark-single-process",
  async publish(key, _lease, bytes, hash) {
    await writeFile(`${output}/${key}.jpg`, bytes);
    await writeFile(`${output}/${key}.sha256`, hash);
  },
  invalidate: async () => undefined,
  release: async () => undefined,
};
const old: number[] = [],
  cold: number[] = [],
  warm: number[] = [];
const run = async (fn: () => Promise<Uint8Array>) => {
  const start = performance.now();
  const bytes = await fn();
  return { time: performance.now() - start, bytes };
};
await transform(); // Codec/JIT priming is identical for all paths; source OS cache remains warm.
let equivalent = true,
  derivedBytes = 0;
const runId = Date.now();
for (let i = 0; i < 7; i++) {
  const before = await run(transform);
  old.push(before.time);
  const key = `${runId}-${i}`;
  const miss = await run(() => resolveDerivative(key, store, transform));
  cold.push(miss.time);
  const hit = await run(() =>
    resolveDerivative(key, store, async () => {
      throw new Error("Unexpected warm transform");
    }),
  );
  warm.push(hit.time);
  equivalent =
    equivalent &&
    (await checksum(before.bytes)) === (await checksum(miss.bytes)) &&
    (await checksum(before.bytes)) === (await checksum(hit.bytes));
  derivedBytes = hit.bytes.byteLength;
}
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    runsMs: values,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
const report = {
  recordedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  repetitions: 7,
  source: { type, bytes: source.byteLength, width: first.width, height: first.height },
  output: {
    width: Math.min(960, first.width),
    quality: 80,
    format: "jpeg",
    bytes: derivedBytes,
    byteIdentical: equivalent,
  },
  conditions:
    "Codec/JIT primed; source bytes and OS cache warm. Before repeats decode/resize/encode. After cold misses derived disk store; after warm reads private filesystem bytes and verifies SHA256. Filesystem adapter measures processing reuse, not Supabase network, HTTP TTFB, browser cache or production concurrency.",
  beforeRepeatedTransform: stats(old),
  afterDerivedCold: stats(cold),
  afterDerivedWarm: stats(warm),
};
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
