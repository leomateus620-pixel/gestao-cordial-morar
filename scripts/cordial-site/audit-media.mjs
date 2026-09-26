// Read-only private Storage audit; no signed URLs or credentials are persisted.
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const output = process.env.SITE_AUDIT_OUTPUT || ".local/cordial-site-audit";
const snapshot = JSON.parse(await readFile(`${output}/snapshot.json`, "utf8"));
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await client.auth.signInWithPassword({
  email: process.env.SITE_AUDIT_EMAIL,
  password: process.env.SITE_AUDIT_PASSWORD,
});
if (error) throw Error("Audit sign-in failed");
const paths = [
  ...new Set(
    snapshot.property_images
      .flatMap((i) => [i.storage_path, i.processed_storage_path, i.thumbnail_storage_path])
      .filter(Boolean),
  ),
];
const prefixes = [...new Set(paths.map((p) => p.slice(0, p.lastIndexOf("/"))))],
  objects = new Map(),
  failures = [];
let index = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (index < prefixes.length) {
      const prefix = prefixes[index++];
      try {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await client.storage
            .from("property-images")
            .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
          if (error) throw error;
          for (const o of data ?? [])
            objects.set(prefix + "/" + o.name, {
              size: o.metadata?.size,
              mimetype: o.metadata?.mimetype,
              etag: o.metadata?.eTag,
            });
          if (!data || data.length < 1000) break;
        }
      } catch {
        failures.push(prefix);
      }
    }
  }),
);
const missing = paths.filter((p) => !objects.has(p)),
  external = paths.filter((p) => /^https?:/i.test(p));
const photoRows = snapshot.properties.map((p) => {
  const images = snapshot.property_images
    .filter((i) => i.property_id === p.id)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    propertyId: p.id,
    count: images.length,
    cover: images[0]?.position === 0 ? images[0].id : null,
    duplicatePositions: images.length !== new Set(images.map((i) => i.position)).size,
    missingFiles: images.filter((i) => !objects.has(i.storage_path)).map((i) => i.id),
    dimensionsMissing: images.filter((i) => !i.width || !i.height).length,
  };
});
const byHash = new Map();
for (const i of snapshot.property_images) {
  const hash = objects.get(i.storage_path)?.etag;
  if (hash) {
    const values = byHash.get(hash) || [];
    values.push(i.id);
    byHash.set(hash, values);
  }
}
const duplicates = [...byHash.values()].filter((ids) => ids.length > 1);
const summary = {
  finishedAt: new Date().toISOString(),
  sourceImages: snapshot.property_images.length,
  uniqueReferencedPaths: paths.length,
  prefixes: prefixes.length,
  failedPrefixes: failures.length,
  existingPaths: paths.length - missing.length,
  missingPaths: missing.length,
  externalPaths: external.length,
  duplicateContentGroups: duplicates.length,
  missingCover: photoRows.filter((x) => x.count && !x.cover).length,
  duplicatePositionProperties: photoRows.filter((x) => x.duplicatePositions).length,
  verification:
    "Storage metadata for every referenced original/processed/thumbnail; not a complete binary decode or visual equivalence check",
};
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/media-audit.json`,
  JSON.stringify({ summary, missing, failures, duplicates, properties: photoRows }, null, 2),
);
await writeFile(`${output}/media-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await client.auth.signOut({ scope: "local" });
if (failures.length) process.exitCode = 2;
