// Read-only on Gestão. Files and explicit approval simulations remain under .local/.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

if (process.env.QAMORAR_LOCAL_QA !== "true")
  throw Error("Set QAMORAR_LOCAL_QA=true for the restricted local QA preparation.");
const output = ".local/morar-site-audit";
const snapshot = JSON.parse(await readFile(`${output}/snapshot.json`, "utf8"));
const outcomes = JSON.parse(await readFile(`${output}/publication-candidates.json`, "utf8"));
const candidateIds = new Set(
  outcomes.filter((p) => p.reasons.length === 0).map((p) => p.propertyId),
);
const sourceProperties = snapshot.properties.filter((p) => candidateIds.has(p.id));
if (!sourceProperties.length || sourceProperties.length !== candidateIds.size)
  throw Error("Incomplete candidate identities in the restricted inventory.");
const sourceImages = snapshot.property_images.filter((i) => candidateIds.has(i.property_id));
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: authError } = await client.auth.signInWithPassword({
  email: process.env.SITE_AUDIT_EMAIL,
  password: process.env.SITE_AUDIT_PASSWORD,
});
if (authError) throw Error(`QA read authentication failed (${authError.status ?? "unknown"}).`);

try {
  const propertyColumns = [
    ...Object.keys(sourceProperties[0]),
    "caracteristicas",
    "dormitorios",
    "banheiros",
    "suites",
    "vagas",
    "permuta",
    "aceita_financiamento",
    "publish_targets",
    "logradouro",
    "numero",
  ];
  const imageColumns = [
    ...Object.keys(sourceImages[0]),
    "original_storage_path",
    "destination_hash",
    "desired_destination_hash",
    "pending_remote_delete",
    "processing_error_code",
    "processing_error_message",
  ];
  async function readByProperties(table, columns, key) {
    const rows = [];
    const ids = [...candidateIds].sort();
    for (let start = 0; start < ids.length; start += 50) {
      let cursor;
      for (;;) {
        let query = client
          .from(table)
          .select([...new Set(columns)].join(","))
          .in(key, ids.slice(start, start + 50))
          .order("id")
          .limit(500);
        if (cursor) query = query.gt("id", cursor);
        const { data, error } = await query;
        if (error) throw Error(`${table}: restricted QA read failed (${error.code}).`);
        if (!data?.length) break;
        rows.push(...data);
        cursor = data.at(-1).id;
      }
    }
    if (new Set(rows.map((p) => p.id)).size !== rows.length)
      throw Error(`${table}: repeated canonical identity in the QA read.`);
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  }
  const [properties, images] = await Promise.all([
    readByProperties("properties", propertyColumns, "id"),
    readByProperties("property_images", imageColumns, "property_id"),
  ]);
  // Abort rather than merge a newer inventory silently with the reviewed snapshot.
  for (const [before, after] of [
    [sourceProperties, properties],
    [sourceImages, images],
  ]) {
    const current = new Map(after.map((p) => [p.id, p]));
    if (before.length !== after.length)
      throw Error("Inventory changed; repeat the complete audit before QA.");
    for (const row of before) {
      const candidate = current.get(row.id);
      if (
        !candidate ||
        Object.keys(row).some((key) => JSON.stringify(row[key]) !== JSON.stringify(candidate[key]))
      )
        throw Error("Inventory changed; repeat the complete audit before QA.");
    }
  }
  const ordered = [...properties].sort(
    (a, b) =>
      String(a.codigo_morar ?? "").localeCompare(String(b.codigo_morar ?? ""), "pt-BR", {
        numeric: true,
      }) || a.id.localeCompare(b.id),
  );
  const representatives = [];
  function pick(kind, predicate, count = 1) {
    for (const p of ordered.filter(predicate)) {
      if (representatives.some((r) => r.propertyId === p.id)) continue;
      representatives.push({
        kind,
        propertyId: p.id,
        reference: p.codigo_morar,
        type: p.tipo,
        operation: p.operacao,
      });
      if (--count === 0) break;
    }
  }
  pick("featured", (p) => p.destaque_inicial === true);
  pick("rental_house", (p) => p.operacao === "aluguel" && p.tipo === "Casa", 2);
  pick("apartment", (p) => p.tipo === "Apartamento");
  pick("land", (p) => p.tipo === "Terreno");
  if (representatives.length !== 5)
    throw Error("The requested real representative galleries were not found.");
  const galleryIds = new Set(representatives.map((p) => p.propertyId));
  const covers = properties.map((p) => {
    const cover = images.find((i) => i.property_id === p.id && i.position === 0);
    if (!cover) throw Error("A candidate has no canonical position-zero cover.");
    return cover;
  });
  const requestedImages = new Map(
    [...covers, ...images.filter((i) => galleryIds.has(i.property_id))].map((i) => [i.id, i]),
  );
  const paths = [
    ...new Set(
      [...requestedImages.values()].map((i) =>
        i.processing_status === "ready" ? i.processed_storage_path : i.storage_path,
      ),
    ),
  ];
  if (
    paths.some(
      (path) =>
        typeof path !== "string" ||
        !path ||
        /^https?:/i.test(path) ||
        path.includes("..") ||
        path.startsWith("/"),
    )
  )
    throw Error(
      "A canonical QA image has an unsupported storage path; no arbitrary URL downloads are allowed.",
    );
  await mkdir(`${output}/qa-images`, { recursive: true });
  let oldMedia = {};
  try {
    oldMedia = JSON.parse(await readFile(`${output}/qa-sample.json`, "utf8")).media ?? {};
  } catch {
    /* First preparation. */
  }
  const media = {},
    failures = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++];
        const key = createHash("sha256").update(path).digest("hex");
        if (oldMedia[path]?.key === key) {
          try {
            const cached = await stat(`${output}/qa-images/${key}`);
            if (cached.size > 0) {
              media[path] = oldMedia[path];
              continue;
            }
          } catch {
            /* Download missing cache bytes. */
          }
        }
        const { data, error } = await client.storage.from("property-images").download(path);
        if (error) {
          failures.push({
            imageIds: [...requestedImages.values()]
              .filter((i) => i.storage_path === path || i.processed_storage_path === path)
              .map((i) => i.id),
            status: error.statusCode ?? "unknown",
          });
          continue;
        }
        const bytes = new Uint8Array(await data.arrayBuffer());
        await writeFile(`${output}/qa-images/${key}`, bytes);
        media[path] = {
          key,
          type: data.type || "application/octet-stream",
          bytes: bytes.length,
          checksum: createHash("sha256").update(bytes).digest("hex"),
        };
      }
    }),
  );
  const notice =
    "RESTRICTED LOCAL QA ONLY. Real read-only catalogue metadata and unmodified canonical image bytes. Publication/authorization/availability/media approval is simulated explicitly only in isolated PGlite; no production approval, publication, lead or provider job is created.";
  const sample = {
    notice,
    preparedAt: new Date().toISOString(),
    properties,
    images,
    media,
    representatives,
    providers: snapshot.property_provider_publications.filter((p) =>
      candidateIds.has(p.property_id),
    ),
    sourceInventoryCounts: {
      properties: snapshot.properties.length,
      providers: snapshot.property_provider_publications.length,
      images: snapshot.property_images.length,
    },
    failures,
  };
  await writeFile(`${output}/qa-sample.json`, JSON.stringify(sample, null, 2));
  const report = {
    notice,
    preparedAt: sample.preparedAt,
    candidates: properties.length,
    imageMetadata: images.length,
    canonicalCovers: covers.length,
    representativeGalleries: representatives,
    requestedImageFiles: paths.length,
    downloadedImageFiles: Object.keys(media).length,
    failedDownloads: failures.length,
    verification:
      "All requested bytes downloaded unmodified; complete galleries are downloaded only for the five listed real properties. Other galleries retain full canonical metadata and honest missing-byte responses in local QA.",
  };
  await writeFile(`${output}/qa-preparation-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (failures.length)
    throw Error(
      "Some requested canonical images failed to download; see restricted QA preparation report.",
    );
} finally {
  await client.auth.signOut({ scope: "local" });
}
