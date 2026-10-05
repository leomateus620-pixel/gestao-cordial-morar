import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareActivation,
  bindCurrentInventory,
  scopeHash,
  sha256,
  privatePath,
  main,
  assertUnchangedReviewedMedia,
} from "../../scripts/morar-site/activate.mjs";

const digest = (value: unknown) => sha256(JSON.stringify(value));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const ids = [1, 2, 3, 4, 5].map(id);
  const outcomes = ids.map((propertyId, i) => ({ propertyId, reasons: [], shared: i === 0 }));
  const properties = ids.map((propertyId, i) => ({
    id: propertyId,
    revision: 3,
    source: "imobibrasil",
    is_draft: false,
    exibir_imovel: true,
    autorizacao: null,
    disponibilidade: null,
    operacao: i === 0 ? "aluguel" : "venda",
    tipo: i === 1 ? "Apartamento" : "Casa",
  }));
  const snapshot = {
    properties,
    property_provider_publications: ids.map((propertyId, i) => ({
      id: id(100 + i),
      property_id: propertyId,
      provider: "morar",
      enabled: true,
      desired_availability: "visible",
    })),
    property_images: ids.flatMap((propertyId, i) =>
      [0, 1, 2].map((position) => ({
        id: id(200 + i * 3 + position),
        property_id: propertyId,
        position,
      })),
    ),
  };
  const candidateHash = digest(outcomes);
  const summary = {
    stableDoubleScan: true,
    hashes: Object.fromEntries(
      Object.entries(snapshot).map(([name, rows]) => [name, digest(rows)]),
    ),
  };
  const authorized = {
    count: 5,
    idsSha256: scopeHash(ids),
    candidatesFileSha256: candidateHash,
    quote: "Fixture isolated from production authorization.",
  };
  const mediaSummary = {
    sourceImages: 15,
    missingPaths: 0,
    externalPaths: 0,
    failedPrefixes: 0,
    missingCover: 0,
    duplicatePositionProperties: 0,
  };
  const input = {
    outcomes,
    snapshot,
    summary,
    mediaSummary,
    fileHashes: { candidates: candidateHash, mediaSummary: digest(mediaSummary) },
  };
  return { ids, input, authorized };
}

test("preparation binds exact approved identities, allows scoped NULL approval and does not claim media review", () => {
  const { ids, input, authorized } = fixture();
  const result = prepareActivation(input, authorized);
  assert.deepEqual(result.propertyIds, ids);
  assert.equal(result.flags.confirmAuthorization, true);
  assert.equal(result.flags.confirmAvailability, true);
  assert.equal(result.flags.reviewMedia, false);
  assert.equal(result.flags.areasM2, false);
  assert.equal(result.activationExecuted, false);
  assert.equal(result.rpc.items, null);
  assert.equal(input.snapshot.properties[0].autorizacao, null);
});

test("substitution, unstable inventory and tampered source cannot expand authorization", () => {
  const { input, authorized } = fixture();
  assert.throws(
    () =>
      prepareActivation(
        { ...input, summary: { ...input.summary, stableDoubleScan: false } },
        authorized,
      ),
    /not stable/,
  );
  assert.throws(
    () =>
      prepareActivation(
        { ...input, fileHashes: { ...input.fileHashes, candidates: "changed" } },
        authorized,
      ),
    /snapshot changed/,
  );
  const duplicate = { ...input, outcomes: [...input.outcomes, input.outcomes[0]] };
  assert.throws(() => prepareActivation(duplicate, authorized), /Duplicate identities/);
  assert.throws(
    () =>
      prepareActivation(input, {
        ...authorized,
        idsSha256: scopeHash(input.outcomes.slice(1).map((row) => row.propertyId)),
      }),
    /authorization scope/,
  );
  const tampered = structuredClone(input);
  tampered.snapshot.properties[0].revision++;
  assert.throws(() => prepareActivation(tampered, authorized), /integrity failed/);
});

test("negative authorization, hidden or retired source never become approved by the scoped user instruction", () => {
  for (const changed of [
    { autorizacao: false },
    { exibir_imovel: false },
    { archived_at: "2026-10-05" },
    { disponibilidade: "nao" },
  ]) {
    const { input, authorized } = fixture();
    Object.assign(input.snapshot.properties[0], changed);
    input.summary.hashes.properties = digest(input.snapshot.properties);
    assert.throws(() => prepareActivation(input, authorized), /canonical publication block/);
  }
});

test("server inventory binding excludes foreign properties and stops the whole batch on revision/block changes", () => {
  const { ids, input, authorized } = fixture();
  const bundle = prepareActivation(input, authorized);
  const inventory = [...ids, id(99)].map((propertyId) => ({
    propertyId,
    candidate: true,
    blockers: [],
    revision: 3,
    snapshotHash: `server-${propertyId}`,
  }));
  const bound = bindCurrentInventory(bundle, inventory);
  assert.equal(bound.rpc.arguments._dry_run, true);
  assert.equal(bound.rpc.arguments._items.length, 5);
  assert.deepEqual(
    bound.rpc.arguments._items.map((row) => row.propertyId),
    ids,
  );
  assert.throws(
    () => bindCurrentInventory(bundle, inventory.slice(1)),
    /changed, disappeared or became blocked/,
  );
  assert.throws(
    () =>
      bindCurrentInventory(
        bundle,
        inventory.map((row, i) => (i === 0 ? { ...row, revision: 4 } : row)),
      ),
    /changed, disappeared or became blocked/,
  );
  assert.throws(
    () =>
      bindCurrentInventory(
        bundle,
        inventory.map((row, i) => (i === 0 ? { ...row, blockers: ["manual_withdrawal"] } : row)),
      ),
    /changed, disappeared or became blocked/,
  );
});

test("media approval requires matching integral metadata and representative associated gallery evidence", () => {
  const { ids, input, authorized } = fixture();
  const mediaReview = {
    scopeSha256: authorized.idsSha256,
    metadataSummarySha256: input.fileHashes.mediaSummary,
    reviewedBy: "Isolated test reviewer",
    statement: "Fixture gallery review, not production evidence.",
    visualSamples: ids.map((propertyId) => ({
      propertyId,
      imageIds: input.snapshot.property_images
        .filter((row) => row.property_id === propertyId)
        .map((row) => row.id),
      evidencePaths: [`.local/fixtures/${propertyId}.png`],
    })),
  };
  assert.equal(prepareActivation({ ...input, mediaReview }, authorized).flags.reviewMedia, true);
  assert.throws(
    () =>
      prepareActivation(
        { ...input, mediaReview: { ...mediaReview, metadataSummarySha256: "wrong" } },
        authorized,
      ),
    /metadata audit/,
  );
  assert.throws(
    () =>
      prepareActivation(
        {
          ...input,
          mediaReview: { ...mediaReview, visualSamples: mediaReview.visualSamples.slice(0, 4) },
        },
        authorized,
      ),
    /five representative/,
  );
  const misplaced = structuredClone(mediaReview);
  misplaced.visualSamples[0].imageIds[0] = id(999);
  assert.throws(
    () => prepareActivation({ ...input, mediaReview: misplaced }, authorized),
    /wrong image association/,
  );
});

test("CLI cannot execute a remote application and rejects output outside the private directory", async () => {
  await assert.rejects(main(["--apply"]), /Remote writes are disabled/);
  assert.throws(() => privatePath("public/activation.json"), /restricted/);
  assert.throws(() => privatePath(".local/../public/activation.json"), /restricted/);
  assert.throws(() => privatePath(".local"), /restricted/);
});

test("a media receipt cannot approve newly added, removed or changed canonical images", () => {
  const { input, authorized } = fixture();
  const bundle = prepareActivation(input, authorized);
  assert.doesNotThrow(() =>
    assertUnchangedReviewedMedia(bundle, [...input.snapshot.property_images].reverse()),
  );
  assert.throws(
    () => assertUnchangedReviewedMedia(bundle, input.snapshot.property_images.slice(1)),
    /Canonical media changed/,
  );
  assert.throws(
    () =>
      assertUnchangedReviewedMedia(bundle, [
        ...input.snapshot.property_images,
        { id: id(999), property_id: bundle.propertyIds[0], position: 4 },
      ]),
    /Canonical media changed/,
  );
  const changed = structuredClone(input.snapshot.property_images);
  changed[0].position = 4;
  assert.throws(() => assertUnchangedReviewedMedia(bundle, changed), /Canonical media changed/);
});

test("a canonical two-photo gallery is reviewed in full without fabricating a third photo", () => {
  const { ids, input, authorized } = fixture();
  input.snapshot.property_images = input.snapshot.property_images.filter(
    (image) => image.id !== id(214),
  );
  input.summary.hashes.property_images = digest(input.snapshot.property_images);
  input.mediaSummary.sourceImages = input.snapshot.property_images.length;
  input.fileHashes.mediaSummary = digest(input.mediaSummary);
  const receipt = {
    scopeSha256: authorized.idsSha256,
    metadataSummarySha256: input.fileHashes.mediaSummary,
    reviewedBy: "Isolated fixture reviewer",
    statement: "Only existing associated photos were inspected.",
    visualSamples: ids.map((propertyId) => ({
      propertyId,
      imageIds: input.snapshot.property_images
        .filter((image) => image.property_id === propertyId)
        .map((image) => image.id),
      evidencePaths: [`.local/fixtures/${propertyId}.png`],
    })),
  };
  assert.equal(receipt.visualSamples.at(-1)?.imageIds.length, 2);
  assert.equal(
    prepareActivation({ ...input, mediaReview: receipt }, authorized).flags.reviewMedia,
    true,
  );
  receipt.visualSamples.at(-1)!.imageIds.pop();
  assert.throws(
    () => prepareActivation({ ...input, mediaReview: receipt }, authorized),
    /wrong image association or missing evidence/,
  );
  receipt.visualSamples.at(-1)!.imageIds.push(receipt.visualSamples.at(-1)!.imageIds[0]);
  assert.throws(
    () => prepareActivation({ ...input, mediaReview: receipt }, authorized),
    /wrong image association or missing evidence/,
  );
});
