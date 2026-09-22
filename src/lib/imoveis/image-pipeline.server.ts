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
  const { data, error } = await admin
    .from("properties")
    .select("publish_targets")
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Imóvel não encontrado para processar a foto.");
  return normalizeTargets(data.publish_targets);
}

/** Enfileira (ou reenfileira) as fotos do imóvel para o destino atual. */
export async function enqueueImageJobs(
  admin: Admin,
  propertyId: string,
  options: { imageIds?: string[]; targets?: readonly string[]; force?: boolean } = {},
): Promise<{ enqueued: number; variant: WatermarkVariant; hash: string }> {
  const targets = options.targets
    ? normalizeTargets(options.targets)
    : await propertyTargets(admin, propertyId);
  const variant = variantForTargets(targets);
  const hash = destinationHash(targets);

  let query = admin
    .from("property_images")
    .select("id, storage_path, original_storage_path, destination_hash, desired_destination_hash, processing_status")
    .eq("property_id", propertyId)
    .or("pending_remote_delete.is.null,pending_remote_delete.eq.false");
  if (options.imageIds?.length) query = query.in("id", options.imageIds);
  const { data: images, error: imagesError } = await query;
  if (imagesError) throw new Error(imagesError.message);
  const rows = (images ?? []) as Array<{
    id: string;
    destination_hash: string | null;
    desired_destination_hash: string | null;
    processing_status: string;
  }>;

  // A escolha pode mudar enquanto a leitura está em andamento. A intenção no
  // banco vence; o watchdog retomará com a variante que ficou gravada.
  if (rows.some((row) => row.desired_destination_hash !== hash)) {
    throw new Error("Os destinos das fotos mudaram durante o enfileiramento.");
  }

  const failed = ["failed", "failed_retryable"];
  const stale = rows.filter(
    (row) => options.force || row.destination_hash !== hash || failed.includes(row.processing_status),
  );
  if (!stale.length) return { enqueued: 0, variant, hash };

  const ids = stale.map((row) => row.id);
  // Jobs de destinos antigos deixam de valer.
  const { error: cancelError } = await admin
    .from("property_image_jobs")
    .update({ status: "cancelled", last_error_code: "destination_changed" })
    .in("image_id", ids)
    .neq("destination_hash", hash)
    .in("status", ["pending", "processing", "retry"]);
  if (cancelError) throw new Error(cancelError.message);

  const { data: pendingRows, error: pendingError } = await admin
    .from("property_images")
    .update({
      processing_status: "pending",
      processing_error_code: null,
      processing_error_message: null,
    })
    .in("id", ids)
    .eq("desired_destination_hash", hash)
    .select("id");
  if (pendingError) throw new Error(pendingError.message);
  if ((pendingRows ?? []).length !== ids.length) {
    throw new Error("Os destinos das fotos mudaram durante o enfileiramento.");
  }

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
      locked_at: null,
      locked_by: null,
      last_error_code: null,
      last_error_message: null,
      correlation_id: crypto.randomUUID(),
    })),
    { onConflict: "image_id,destination_hash", ignoreDuplicates: false },
  );
  if (error) {
    const { error: markError } = await admin
      .from("property_images")
      .update({
        processing_status: "failed_retryable",
        processing_error_code: "enqueue_failed",
        processing_error_message: "Não foi possível iniciar o processamento da foto.",
        processing_finished_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (markError) console.error("[image_enqueue_failure]", JSON.stringify({ propertyId, error: markError.message }));
    throw new Error(error.message);
  }
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
  locked_by: string;
};

async function assertImageLease(admin: Admin, job: Job): Promise<void> {
  const { data, error } = await admin.rpc("property_image_renew_lease", {
    _job_id: job.id, _worker: job.locked_by, _lease_seconds: 180,
  });
  if (error || data !== true) throw new WatermarkError("lease_lost", error?.message ?? "A reserva da foto expirou.");
}

function derivedPaths(propertyId: string, imageId: string, hash: string) {
  const key = hash.replace(/[^a-z0-9]+/gi, "-");
  return {
    processed: `${propertyId}/marcadas/${imageId}-${key}.jpg`,
    thumbnail: `${propertyId}/marcadas/${imageId}-${key}-thumb.jpg`,
  };
}

/** Erros que não adiantam repetir: o arquivo enviado é inválido. */
const PERMANENT_CODES = [
  "invalid_type",
  "too_large",
  "too_small",
  "too_many_pixels",
  "empty_file",
  "decode_failed",
];

export async function processImageJob(admin: Admin, job: Job): Promise<void> {
  await assertImageLease(admin, job);
  const { data: image, error: imageError } = await admin
    .from("property_images")
    .select(
      "id, property_id, storage_path, original_storage_path, destination_hash, desired_destination_hash, processed_checksum",
    )
    .eq("id", job.image_id)
    .maybeSingle();
  if (imageError) throw new WatermarkError("image_read_failed", imageError.message);
  if (!image) {
    const { error: cancelError } = await admin.from("property_image_jobs")
      .update({ status: "cancelled" }).eq("id", job.id).eq("locked_by", job.locked_by);
    if (cancelError) throw new WatermarkError("persist_failed", cancelError.message);
    return;
  }
  if (image.desired_destination_hash !== job.destination_hash) {
    throw new WatermarkError("lease_lost", "Os destinos da foto mudaram.");
  }

  const { data: processingRows, error: processingError } = await admin
    .from("property_images")
    .update({
      processing_status: "processing",
      processing_started_at: new Date().toISOString(),
      processing_finished_at: null,
    })
    .eq("id", job.image_id)
    .eq("desired_destination_hash", job.destination_hash)
    .eq("pending_remote_delete", false)
    .select("id");
  if (processingError) throw new WatermarkError("persist_failed", processingError.message);
  if ((processingRows ?? []).length !== 1) throw new WatermarkError("lease_lost", "A foto mudou de destino.");

  const originalPath: string = image.original_storage_path ?? image.storage_path;
  const download = await admin.storage.from(BUCKET).download(originalPath);
  if (download.error || !download.data)
    throw new WatermarkError("download_failed", "Foto original indisponível.");

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const result = await applyWatermark(bytes, job.watermark_variant);
  const paths = derivedPaths(job.property_id, job.image_id, job.destination_hash);

  await assertImageLease(admin, job);
  const upload = await admin.storage
    .from(BUCKET)
    .upload(paths.processed, result.processed, { contentType: "image/jpeg", upsert: true });
  if (upload.error) throw new WatermarkError("upload_failed", upload.error.message);
  await assertImageLease(admin, job);
  const thumbnailUpload = await admin.storage
    .from(BUCKET)
    .upload(paths.thumbnail, result.thumbnail, { contentType: "image/jpeg", upsert: true });
  if (thumbnailUpload.error)
    throw new WatermarkError("upload_failed", thumbnailUpload.error.message);

  // Integridade: só é "pronta" depois que o arquivo final volta legível do Storage.
  const verify = await admin.storage.from(BUCKET).download(paths.processed);
  if (verify.error || !verify.data)
    throw new WatermarkError("verify_failed", "A foto marcada não pôde ser confirmada.");
  const verifiedSize = (verify.data as Blob).size ?? 0;
  if (!verifiedSize) throw new WatermarkError("verify_failed", "A foto marcada ficou vazia.");

  await assertImageLease(admin, job);
  const { data: completed, error } = await admin.rpc("property_image_complete_job", {
    _job_id: job.id, _worker: job.locked_by,
    _result: {
      original_storage_path: originalPath, processed_storage_path: paths.processed,
      thumbnail_storage_path: paths.thumbnail, processed_checksum: result.processedChecksum,
      width: result.width, height: result.height,
    },
  });
  if (error || completed !== true) throw new WatermarkError("lease_lost", error?.message ?? "Outro worker assumiu a foto.");
}

async function failJob(admin: Admin, job: Job, error: unknown) {
  const raw = (error as Error)?.message ?? "Falha ao aplicar a marca.";
  const wasmBlocked = /WebAssembly|Wasm code generation/i.test(raw);
  const code = wasmBlocked
    ? "runtime_wasm_unavailable"
    : error instanceof WatermarkError
      ? error.code
      : "unexpected";
  const message = wasmBlocked
    ? "Processamento da marca indisponível no servidor; aguardando correção da configuração."
    : raw.slice(0, 400);
  // O orçamento de tentativas só muda a cadência. Rede, Storage e runtime
  // voltam após correção; apenas um arquivo comprovadamente inválido bloqueia.
  const terminal = PERMANENT_CODES.includes(code);
  const baseDelay = wasmBlocked ? 21_600 :
    Math.min(job.attempts >= job.max_attempts ? 21_600 : 3_600,
      2 ** Math.min(job.attempts, 11) * 15);
  const delaySeconds = baseDelay + Math.floor(Math.random() * Math.min(300, baseDelay * 0.15));
  const { data: persisted, error: persistError } = await admin.rpc("property_image_fail_job", {
    _job_id: job.id, _worker: job.locked_by,
    _failure: { code, message, terminal, run_after: new Date(Date.now() + delaySeconds * 1000).toISOString() },
  });
  if (persistError) throw new Error(persistError.message);
  if (persisted !== true && code !== "lease_lost") throw new Error("Falha da foto não pôde ser persistida sob o lease atual.");
}

/** Recover originals registered just before an enqueue failure or worker restart. */
async function recoverMissingImageJobs(admin: Admin): Promise<number> {
  const { data: images, error } = await admin.rpc("property_image_recovery_candidates", {
    _limit: 60,
  });
  if (error) throw new Error(error.message);
  const byProperty = new Map<string, string[]>();
  for (const row of (images ?? []) as Array<{ id: string; property_id: string }>) {
    byProperty.set(row.property_id, [...(byProperty.get(row.property_id) ?? []), row.id]);
  }
  let recovered = 0;
  for (const [propertyId, imageIds] of byProperty) {
    const result = await enqueueImageJobs(admin, propertyId, { imageIds, force: true });
    recovered += result.enqueued;
  }
  return recovered;
}

/** Processa um lote limitado da fila. Lotes pequenos evitam estouro de tempo/memória. */
export async function runImageWorker(
  admin: Admin,
  options: { limit?: number } = {},
): Promise<{ claimed: number; processed: number; failed: number; pending: number }> {
  const limit = Math.min(3, Math.max(1, options.limit ?? 2));
  const worker = `image-worker-${crypto.randomUUID().slice(0, 8)}`;
  await recoverMissingImageJobs(admin);
  // Trabalhos travados (lease vencido) voltam para a fila antes de reivindicar.
  const { error: reclaimError } = await admin.rpc("property_image_reclaim_stale", { _max: 50 });
  if (reclaimError) throw new Error(reclaimError.message);
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

  const { count, error: countError } = await admin
    .from("property_image_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "retry"]);
  if (countError) throw new Error(countError.message);

  return { claimed: (jobs ?? []).length, processed, failed, pending: count ?? 0 };
}
