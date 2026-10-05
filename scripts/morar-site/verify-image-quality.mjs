// Local binary audit only. Never modifies images or contacts remote storage.
import { readFile, writeFile } from "node:fs/promises";
import jpeg from "jpeg-js";
import { decode as png } from "fast-png";

const dir = ".local/morar-site-audit";
const sample = JSON.parse(await readFile(`${dir}/qa-sample.json`, "utf8"));
if (!sample.notice?.includes("RESTRICTED LOCAL QA ONLY")) throw Error("Invalid local sample.");
const rows = [];
for (const [path, media] of Object.entries(sample.media)) {
  if (!/^[a-f0-9]{64}$/.test(media.key)) throw Error("Invalid local file identity.");
  try {
    const bytes = await readFile(`${dir}/qa-images/${media.key}`);
    // Storage Content-Type can be inconsistent; decode the actual file signature, like the API.
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const decoded = isPng
      ? png(bytes)
      : jpeg.decode(bytes, { maxMemoryUsageInMB: 256, maxResolutionInMP: 60 });
    rows.push({
      path,
      width: decoded.width,
      height: decoded.height,
      ok: true,
      contentTypeMismatch: media.type !== (isPng ? "image/png" : "image/jpeg"),
    });
  } catch {
    rows.push({ path, ok: false });
  }
}
const good = rows.filter((row) => row.ok);
const summary = {
  verifiedAt: new Date().toISOString(),
  count: rows.length,
  decoded: good.length,
  failures: rows.length - good.length,
  below960: good.filter((r) => r.width < 960).length,
  below480: good.filter((r) => r.width < 480).length,
  contentTypeMismatches: good.filter((r) => r.contentTypeMismatch).length,
  minWidth: Math.min(...good.map((r) => r.width)),
  maxWidth: Math.max(...good.map((r) => r.width)),
  scope: "308 canonical covers plus five complete galleries; not all 4623 binary files",
};
await writeFile(`${dir}/qa-image-quality.json`, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary));
if (summary.failures) process.exitCode = 1;
