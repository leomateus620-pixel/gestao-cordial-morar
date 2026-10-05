// Default: prepare a PRIVATE, reviewable package. Never applies a migration or writes remotely.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat, lstat } from "node:fs/promises";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export const AUTHORIZED_SCOPE = Object.freeze({
  count: 308,
  idsSha256: "6586600e3c5b214370ccd29d6670882237f66b63741644747dc3b1c65e32962b",
  candidatesFileSha256: "d24653542a314068c8084440c15a225d99a2f6f806250256b6f07a5b921bdbcf",
  sessionLocalDate: "2026-10-04",
  timezone: "America/Sao_Paulo",
  quote: "Pode exibir esses imóveis no site.",
  annotation:
    "O inventário completo confirmou 363 vínculos ativos da Morar: 305 exclusivos e 58 compartilhados. Destes, 308 não apresentam bloqueios impeditivos, mas têm autorização ou disponibilidade sem preenchimento. Eles serão apresentados para revisão explícita no Gestão; a implementação não vai converter esses campos vazios em aprovação automática.",
});
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const scopeHash = (ids) => sha256([...ids].sort().join("\n"));
const jsonHash = (value) => sha256(JSON.stringify(value));
const imageColumns = [
  "id",
  "property_id",
  "storage_path",
  "position",
  "is_cover",
  "processing_status",
  "processed_storage_path",
  "thumbnail_storage_path",
  "watermark_variant",
  "watermark_version",
  "width",
  "height",
  "content_hash",
  "processed_checksum",
  "updated_at",
];
export function mediaFingerprint(rows, propertyIds) {
  const ids = new Set(propertyIds);
  return jsonHash(
    rows
      .filter((row) => ids.has(row.property_id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => imageColumns.map((column) => row[column] ?? null)),
  );
}
export function assertUnchangedReviewedMedia(bundle, currentImages) {
  if (
    new Set(currentImages.map((image) => image.id)).size !== currentImages.length ||
    mediaFingerprint(currentImages, bundle.propertyIds) !== bundle.media.imagesFingerprint
  )
    throw Error(
      "Canonical media changed since the integral audit/visual receipt. New, removed or changed files need a new scoped media review.",
    );
}

export function privatePath(path, root = process.cwd()) {
  const directory = resolve(root, ".local");
  const absolute = resolve(root, path);
  const inside = relative(directory, absolute);
  if (
    !inside ||
    isAbsolute(inside) ||
    inside === ".." ||
    inside.startsWith(`..${sep}`) ||
    resolve(directory, inside) !== absolute
  )
    throw Error("Activation files must stay inside the restricted .local/ directory.");
  return absolute;
}

async function checkedPrivatePath(path) {
  const absolute = privatePath(path);
  let current = process.cwd();
  for (const part of relative(current, absolute).split(sep)) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error(
          "Activation sources, receipts and outputs cannot traverse symbolic links outside the private directory.",
        );
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return absolute;
}

/** Pure preparation, exported for isolated tests. CLI always uses the locked real scope above. */
export function prepareActivation(
  { outcomes, snapshot, summary, fileHashes, mediaSummary, mediaReview = null },
  authorized = AUTHORIZED_SCOPE,
) {
  if (!summary.stableDoubleScan)
    throw Error("The source inventory was not stable; no activation package was prepared.");
  if (fileHashes.candidates !== authorized.candidatesFileSha256)
    throw Error("The annotated candidate snapshot changed. A new scoped review is required.");
  for (const table of ["properties", "property_provider_publications", "property_images"]) {
    if (!Array.isArray(snapshot[table]) || jsonHash(snapshot[table]) !== summary.hashes[table])
      throw Error(`Source integrity failed for ${table}.`);
    if (new Set(snapshot[table].map((row) => row.id)).size !== snapshot[table].length)
      throw Error(`Duplicate canonical identity in ${table}.`);
  }
  if (new Set(outcomes.map((row) => row.propertyId)).size !== outcomes.length)
    throw Error("Duplicate identities in candidate reconciliation.");
  const candidates = outcomes.filter(
    (row) => Array.isArray(row.reasons) && row.reasons.length === 0,
  );
  const ids = candidates.map((row) => row.propertyId).sort();
  if (
    ids.some((id) => !uuid.test(id)) ||
    ids.length !== authorized.count ||
    scopeHash(ids) !== authorized.idsSha256
  )
    throw Error("The requested batch is not the exact annotated authorization scope.");
  const properties = new Map(snapshot.properties.map((row) => [row.id, row]));
  const idSet = new Set(ids);
  const imageRows = snapshot.property_images.filter((row) => idSet.has(row.property_id));
  for (const id of ids) {
    const p = properties.get(id);
    const linked = snapshot.property_provider_publications.some(
      (row) =>
        row.property_id === id &&
        row.provider === "morar" &&
        row.enabled === true &&
        row.desired_availability === "visible",
    );
    if (
      !p ||
      !Number.isInteger(p.revision) ||
      !linked ||
      p.is_draft !== false ||
      p.exibir_imovel !== true ||
      p.autorizacao === false ||
      p.archived_at ||
      p.removal_state ||
      !["venda", "aluguel"].includes(p.operacao) ||
      (p.disponibilidade != null &&
        !["sim", "disponivel", "disponível"].includes(p.disponibilidade.trim().toLowerCase())) ||
      (p.source === "gestao_cordial" && !p.registration_completed_at)
    )
      throw Error("An authorized identity now has a canonical publication block.");
  }
  const media = {
    approved: false,
    scope:
      "Only canonical Gestão images associated with these authorized property identities; no invented media or removal of third-party watermarks.",
    sourceImages: imageRows.length,
    imagesFingerprint: mediaFingerprint(imageRows, ids),
    metadataSummarySha256: fileHashes.mediaSummary,
    metadata: mediaSummary,
    visualReview: null,
    limitation:
      "Metadata verification is integral. Binary decoding and visual review are by sample; image rights are not inferred from successful downloads.",
  };
  if (mediaReview) {
    if (
      mediaReview.scopeSha256 !== authorized.idsSha256 ||
      mediaReview.metadataSummarySha256 !== fileHashes.mediaSummary ||
      mediaSummary.sourceImages !== imageRows.length ||
      mediaSummary.missingPaths !== 0 ||
      mediaSummary.externalPaths !== 0 ||
      mediaSummary.failedPrefixes !== 0 ||
      mediaSummary.missingCover !== 0 ||
      mediaSummary.duplicatePositionProperties !== 0
    )
      throw Error("Media review does not match the integral canonical metadata audit.");
    if (
      typeof mediaReview.reviewedBy !== "string" ||
      !mediaReview.reviewedBy.trim() ||
      typeof mediaReview.statement !== "string" ||
      !mediaReview.statement.trim()
    )
      throw Error("Media review needs an identified reviewer and a factual statement.");
    const samples = mediaReview.visualSamples;
    if (!Array.isArray(samples) || new Set(samples.map((sample) => sample.propertyId)).size < 5)
      throw Error("Record at least five representative galleries in the media review receipt.");
    for (const sample of samples) {
      const actualImages = imageRows.filter((image) => image.property_id === sample.propertyId);
      const minimumViewed = Math.min(3, actualImages.length);
      if (
        !idSet.has(sample.propertyId) ||
        !Array.isArray(sample.imageIds) ||
        !actualImages.length ||
        new Set(sample.imageIds).size < minimumViewed ||
        !Array.isArray(sample.evidencePaths) ||
        !sample.evidencePaths.length ||
        sample.imageIds.some(
          (imageId) =>
            !imageRows.some(
              (image) => image.id === imageId && image.property_id === sample.propertyId,
            ),
        )
      )
        throw Error(
          "Visual sample has an unauthorized identity, wrong image association or missing evidence.",
        );
    }
    const sampleIds = new Set(samples.map((sample) => sample.propertyId));
    if (
      !candidates.some((row) => sampleIds.has(row.propertyId) && row.shared) ||
      !ids.some(
        (id) =>
          sampleIds.has(id) &&
          properties.get(id).operacao === "aluguel" &&
          properties.get(id).tipo === "Casa",
      ) ||
      !ids.some((id) => sampleIds.has(id) && properties.get(id).operacao === "venda") ||
      !ids.some((id) => sampleIds.has(id) && properties.get(id).tipo === "Apartamento")
    )
      throw Error(
        "Visual sample must include shared property, house for rent, sale and apartment.",
      );
    media.approved = true;
    media.visualReview = mediaReview;
  }
  const sourceRows = ids.map((id) => {
    const p = properties.get(id);
    return {
      propertyId: id,
      revision: p.revision,
      sourceFingerprint: jsonHash({
        property: p,
        publications: snapshot.property_provider_publications.filter(
          (row) => row.property_id === id,
        ),
        images: imageRows.filter((row) => row.property_id === id),
      }),
    };
  });
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    batchId: randomUUID(),
    dryRun: true,
    authorization: {
      ...authorized,
      provenance:
        "Direct user instruction in this Codex conversation, tied to the quoted annotation. Exact message timestamp unavailable.",
      permits:
        "Display the exact 308 unblocked annotated properties and associated canonical content. No canonical commercial-field edits, global NULL approval, production migration, deploy or DNS change.",
      publicationDecision:
        "Explicit channel approval for these identities, rather than treating missing canonical values as approval.",
    },
    source: {
      stableDoubleScan: true,
      snapshotStartedAt: summary.startedAt,
      snapshotFinishedAt: summary.finishedAt,
      fileHashes,
      tableHashes: summary.hashes,
    },
    propertyIds: ids,
    sourceRows,
    flags: {
      confirmAuthorization: true,
      confirmAvailability: true,
      reviewContent: true,
      reviewMedia: media.approved,
      areasM2: false,
    },
    media,
    rpc: {
      name: "morar_site_review_batch",
      items: null,
      dryRun: true,
      status:
        "Awaiting migrated authenticated inventory: source fingerprints are not server snapshotHash values.",
    },
    activationExecuted: false,
  };
}

export function bindCurrentInventory(bundle, items) {
  const index = new Map(items.map((item) => [item.propertyId, item]));
  if (index.size !== items.length) throw Error("Current inventory repeats canonical identities.");
  const source = new Map(bundle.sourceRows.map((item) => [item.propertyId, item]));
  const selected = bundle.propertyIds.map((id) => {
    const current = index.get(id);
    if (
      !current ||
      !current.candidate ||
      !Array.isArray(current.blockers) ||
      current.blockers.length ||
      !Number.isInteger(current.revision) ||
      current.revision !== source.get(id)?.revision ||
      typeof current.snapshotHash !== "string" ||
      !current.snapshotHash
    )
      throw Error(
        "The scoped batch changed, disappeared or became blocked. Preserve the authorization scope and review the current source before continuing.",
      );
    return { propertyId: id, revision: current.revision, snapshotHash: current.snapshotHash };
  });
  return {
    ...bundle,
    rpc: {
      name: "morar_site_review_batch",
      items: selected,
      dryRun: true,
      status: "Current server snapshot bound; simulation only.",
      arguments: {
        _batch_id: bundle.batchId,
        _items: selected,
        _dry_run: true,
        _confirm_authorization: bundle.flags.confirmAuthorization,
        _confirm_availability: bundle.flags.confirmAvailability,
        _review_media: bundle.flags.reviewMedia,
        _areas_m2: false,
      },
    },
  };
}

async function completeInventory(client) {
  const collect = async () => {
    const items = [],
      seen = new Set();
    let cursor = null,
      total = null;
    for (let page = 0; page < 100; page++) {
      const { data, error } = await client.rpc("morar_site_inventory", {
        _cursor: cursor,
        _limit: 100,
      });
      if (error)
        throw Error(
          "Migrated authenticated inventory unavailable. Check migration/access; no remote publication was attempted.",
        );
      if (!Array.isArray(data?.items) || (total !== null && total !== data.total))
        throw Error("Inventory changed during the cursor scan.");
      total = data.total;
      for (const item of data.items) {
        if (seen.has(item.propertyId)) throw Error("Duplicate inventory identity.");
        seen.add(item.propertyId);
        items.push(item);
      }
      if (!data.nextCursor) {
        if (items.length !== total) throw Error("Incomplete inventory scan.");
        return items;
      }
      if (cursor === data.nextCursor) throw Error("Inventory cursor did not advance.");
      cursor = data.nextCursor;
    }
    throw Error("Inventory scan limit exceeded; it was not treated as complete.");
  };
  const first = await collect(),
    second = await collect();
  if (jsonHash(first) !== jsonHash(second))
    throw Error("Current inventory was not stable across two complete scans.");
  return second;
}

async function verifyCurrentReviewedMedia(client, bundle) {
  const rows = [];
  for (let start = 0; start < bundle.propertyIds.length; start += 50) {
    let cursor = null;
    for (let page = 0; page < 100; page++) {
      let query = client
        .from("property_images")
        .select(imageColumns.join(","))
        .in("property_id", bundle.propertyIds.slice(start, start + 50))
        .order("id")
        .limit(500);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error)
        throw Error(
          "Authenticated media verification failed; the reviewed media flag cannot be used.",
        );
      if (!data?.length) break;
      rows.push(...data);
      cursor = data.at(-1).id;
      if (page === 99)
        throw Error(
          "Media verification exceeded its cursor limit; no complete verification was claimed.",
        );
    }
  }
  assertUnchangedReviewedMedia(bundle, rows);
}

export async function main(argv = process.argv.slice(2)) {
  const args = { output: ".local/morar-site-audit/activation", simulate: false, mediaReview: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--simulate") args.simulate = true;
    else if (flag === "--dry-run") args.simulate = false;
    else if (flag === "--output" && argv[i + 1]) args.output = argv[++i];
    else if (flag === "--media-review" && argv[i + 1]) args.mediaReview = argv[++i];
    else if (flag === "--apply")
      throw Error(
        "Remote writes are disabled in this preparation script. Use the reviewed admin flow after separately authorized migration/activation.",
      );
    else throw Error(`Unknown activation option: ${flag}`);
  }
  const output = await checkedPrivatePath(args.output);
  const source = ".local/morar-site-audit";
  const [candidateText, snapshotText, summaryText, mediaText] = await Promise.all([
    checkedPrivatePath(`${source}/publication-candidates.json`).then((path) =>
      readFile(path, "utf8"),
    ),
    checkedPrivatePath(`${source}/snapshot.json`).then((path) => readFile(path, "utf8")),
    checkedPrivatePath(`${source}/summary.json`).then((path) => readFile(path, "utf8")),
    checkedPrivatePath(`${source}/media-summary.json`).then((path) => readFile(path, "utf8")),
  ]);
  let mediaReview = null;
  if (args.mediaReview) {
    mediaReview = JSON.parse(await readFile(await checkedPrivatePath(args.mediaReview), "utf8"));
    for (const sample of mediaReview.visualSamples ?? [])
      for (const evidence of sample.evidencePaths ?? []) {
        const file = await stat(await checkedPrivatePath(evidence));
        if (!file.isFile() || file.size === 0)
          throw Error("Media-review evidence is missing or empty.");
      }
  }
  let bundle = prepareActivation({
    outcomes: JSON.parse(candidateText),
    snapshot: JSON.parse(snapshotText),
    summary: JSON.parse(summaryText),
    mediaSummary: JSON.parse(mediaText),
    mediaReview,
    fileHashes: {
      candidates: sha256(candidateText),
      snapshot: sha256(snapshotText),
      summary: sha256(summaryText),
      mediaSummary: sha256(mediaText),
    },
  });
  await mkdir(output, { recursive: true });
  const save = async () =>
    writeFile(
      await checkedPrivatePath(resolve(output, "prepared.json")),
      `${JSON.stringify(bundle, null, 2)}\n`,
    );
  await save();
  if (args.simulate) {
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_PUBLISHABLE_KEY ||
      !process.env.SITE_ACTIVATION_ACCESS_TOKEN
    )
      throw Error(
        "Local preparation saved. Simulation requires an authenticated administrator session through server environment variables, never secrets in the package.",
      );
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${process.env.SITE_ACTIVATION_ACCESS_TOKEN}` } },
    });
    const current = await completeInventory(client);
    if (bundle.flags.reviewMedia) await verifyCurrentReviewedMedia(client, bundle);
    bundle = bindCurrentInventory(bundle, current);
    const { data, error } = await client.rpc(bundle.rpc.name, bundle.rpc.arguments);
    if (error)
      throw Error(
        "Dry-run RPC unavailable or rejected. No remote publication was attempted; the restricted package remains saved.",
      );
    if (data?.dryRun !== true || data?.writes !== 0 || typeof data?.snapshotHash !== "string")
      throw Error("The backend did not confirm a simulation without writes.");
    bundle.simulation = { ...data, simulatedAt: new Date().toISOString() };
    await save();
  }
  console.log(
    JSON.stringify(
      {
        count: bundle.propertyIds.length,
        scopeSha256: bundle.authorization.idsSha256,
        preparedPath: resolve(output, "prepared.json"),
        reviewMedia: bundle.flags.reviewMedia,
        simulated: Boolean(bundle.simulation),
        ready: bundle.simulation?.ready === true && bundle.flags.reviewMedia,
        mediaReviewPending: !bundle.flags.reviewMedia,
        remoteWrites: 0,
        activationExecuted: false,
      },
      null,
      2,
    ),
  );
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
