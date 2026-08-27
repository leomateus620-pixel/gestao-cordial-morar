/**
 * Fila de marca-d'água das fotos de imóveis.
 * Mesmo padrão da fila de publicação: lease no banco, tentativas com backoff e
 * status terminal acionável. O original privado nunca é alterado.
 */
import {
  WATERMARK_VERSION,
  destinationHash,
  normalizeTargets,
  variantForTargets,
  type PublishTarget,
  type WatermarkVariant,
} from "./watermark-config";
import { WatermarkError, applyWatermark } from "./watermark.server";

const BUCKET = "property-images";
const MAX_ATTEMPTS = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function propertyTargets(admin: Admin, propertyId: string): Promise<PublishTarget[]> {
  const { data } = await admin
    .from("properties")
    .select("publish_targets, carteira")
    .eq("id", propertyId)
    .maybeSingle();
  const stored = normalizeTargets(data?.publish_targets);
  if (stored.length) return stored;
  return normalizeTargets([data?.carteira]);
}

/** Enfileira (ou reenfileira) as fotos do imóvel para o destino atual. */
export async function enqueueImageJobs(
  admin: Admin,
  propertyId: string,
  options: { imageIds?: string[]; targets?: readonly string[] } = {},
): Promise<{ enqueued: number; variant: WatermarkVariant; hash: string }> {
  const targets = options.targets ? normalizeTargets(options.targets) : await propertyTargets(admin, propertyId);
  const variant = variantForTargets(targets);
  const hash = destinationHash(targets);

  let query = admin
    .from("property_images")
    .select("id, storage_path, original_storage_path, destination_hash, processing_status")
    .eq("property_id", propertyId);
  if (options.imageIds?.length) query = query.in("id", options.imageIds);
  const { data: images } = await query;
  const rows = (images ?? []) as Array<{
    id: string;
    destination_hash: string | null;
    processing_status: string;
  }>;

  const stale = rows.filter((row) => row.destination_hash !== hash || row.processing_status === "failed");
  if (!stale.length) return { enqueued: 0, variant, hash };

  const ids = stale.map((row) => row.id);
  // Jobs de destinos antigos deixam de valer.
  await admin
    .from("property_image_jobs")
    .update({ status: "cancelled", last_error_code: "destination_changed" })
    .in("image_id", ids)
    .neq("destination_hash", hash)
    .in("status", ["pending", "processing", "retry"]);

  await admin
    .from("property_images")
    .update({ processing_status: "pending", processing_error_code: null, processing_error_message: null })
    .in("id", ids);

  const { error } = await admin.from("property_image_jobs").upsert(
    stale.map((row) => ({
      image_id: row.id,
      property_id: propertyId,
      watermark_variant: variant,
      watermark_version: WATERMARK_VERSION,
      destination_hash: hash,
      status: "pending",
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
      run_after: new Date().toISOString(),
      lease_expires_at: null,
      correlation_id: crypto.randomUUID(),
    })),
    { onConflict: "image_id,destination_hash", ignoreDuplicates: true },
  );
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  return { enqueued: stale.length, variant, hash };
}

type Job = {
  id: string;
  image_id: string;
  property_id: string;
  watermark_variant: WatermarkVariant;
  watermark_version: string;
  destination_hash: string;
  attempts: number;
  max_attempts: number;
};

function derivedPaths(propertyId: string, imageId: string, hash: string) {
  const key = hash.replace(/[^a-z0-9]+/gi, "-");
  return {
    processed: `${propertyId}/marcadas/${imageId}-${key}.jpg`,
    thumbnail: `${propertyId}/marcadas/${imageId}-${key}-thumb.jpg`,
  };
}

export async function processImageJob(admin: Admin, job: Job): Promise<void> {
  const { data: image } = await admin
    .from("property_images")
    .select("id, property_id, storage_path, original_storage_path, destination_hash, processed_checksum")
    .eq("id", job.image_id)
    .maybeSingle();
  if (!image) {
    await admin.from("property_image_jobs").update({ status: "cancelled" }).eq("id", job.id);
    return;
  }

  const originalPath: string = image.original_storage_path ?? image.storage_path;
  const download = await admin.storage.from(BUCKET).download(originalPath);
  if (download.error || !download.data) throw new WatermarkError("download_failed", "Foto original indisponível.");

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const result = await applyWatermark(bytes, job.watermark_variant);
  const paths = derivedPaths(job.property_id, job.image_id, job.destination_hash);

  const upload = await admin.storage
    .from(BUCKET)
    .upload(paths.processed, result.processed, { contentType: "image/jpeg", upsert: true });
  if (upload.error) throw new WatermarkError("upload_failed", upload.error.message);
  await admin.storage
    .from(BUCKET)
    .upload(paths.thumbnail, result.thumbnail, { contentType: "image/jpeg", upsert: true });

  const { error } = await admin
    .from("property_images")
    .update({
      original_storage_path: originalPath,
      processed_storage_path: paths.processed,
      thumbnail_storage_path: paths.thumbnail,
      processed_checksum: result.processedChecksum,
      watermark_variant: job.watermark_variant,
      watermark_version: job.watermark_version,
      destination_hash: job.destination_hash,
      processing_status: "ready",
      processing_error_code: null,
      processing_error_message: null,
      processed_at: new Date().toISOString(),
      width: result.width,
      height: result.height,
    })
    .eq("id", job.image_id);
  if (error) throw new WatermarkError("persist_failed", error.message);

  await admin.from("property_image_jobs").update({ status: "succeeded", lease_expires_at: null }).eq("id", job.id);
}

async function failJob(admin: Admin, job: Job, error: unknown) {
  const code = error instanceof WatermarkError ? error.code : "unexpected";
  const message = (error as Error)?.message?.slice(0, 400) ?? "Falha ao aplicar a marca.";
  const terminal =
    job.attempts >= job.max_attempts ||
    ["invalid_type", "too_large", "too_small", "too_many_pixels", "empty_file", "decode_failed"].includes(code);
  const delaySeconds = Math.min(300, 2 ** job.attempts * 15);

  await admin
    .from("property_image_jobs")
    .update({
      status: terminal ? "failed" : "retry",
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lease_expires_at: null,
      last_error_code: code,
      last_error_message: message,
    })
    .eq("id", job.id);

  await admin
    .from("property_images")
    .update({
      processing_status: terminal ? "failed" : "pending",
      processing_error_code: code,
      processing_error_message: message,
    })
    .eq("id", job.image_id);
}

/** Processa um lote limitado da fila. */
export async function runImageWorker(
  admin: Admin,
  options: { limit?: number } = {},
): Promise<{ claimed: number; processed: number; failed: number; pending: number }> {
  const limit = Math.min(6, Math.max(1, options.limit ?? 4));
  const worker = `image-worker-${crypto.randomUUID().slice(0, 8)}`;
  const { data: jobs, error } = await admin.rpc("property_image_claim_jobs", {
    _worker: worker,
    _limit: limit,
    _lease_seconds: 180,
  });
  if (error) throw new Error(error.message);

  let processed = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    try {
      await processImageJob(admin, job);
      processed += 1;
    } catch (err) {
      failed += 1;
      await failJob(admin, job, err);
    }
  }

  const { count } = await admin
    .from("property_image_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "retry"]);

  return { claimed: (jobs ?? []).length, processed, failed, pending: count ?? 0 };
}
