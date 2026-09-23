import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  normalizeTargets,
  variantForTargets,
  watermarkLabel,
  type WatermarkVariant,
} from "@/lib/imoveis/watermark-config";
import type { PropertyImage } from "@/types/property";
import { workerCallerSecret } from "@/lib/workers/hook-auth";
import { rebaseGalleryMove, type GalleryMove } from "@/lib/imoveis/gallery-move";

const BUCKET = "property-images";

type ImageRow = {
  id: string;
  storage_path: string;
  original_storage_path: string | null;
  processed_storage_path: string | null;
  thumbnail_storage_path: string | null;
  is_cover: boolean;
  position: number;
  file_name: string;
  content_hash: string | null;
  upload_status: string;
  processing_status: string;
  processing_error_message: string | null;
  watermark_variant: string | null;
};

const IMAGE_COLUMNS =
  "id, storage_path, original_storage_path, processed_storage_path, thumbnail_storage_path, is_cover, position, file_name, content_hash, upload_status, processing_status, processing_error_message, watermark_variant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/** A foto exibida é sempre a versão com marca quando ela já existe. */
async function signImages(supabase: Client, rows: ImageRow[]): Promise<PropertyImage[]> {
  if (!rows.length) return [];
  const paths = rows.map((r) => r.processed_storage_path ?? r.storage_path);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const byPath = new Map(
    ((signed ?? []) as Array<{ path?: string | null; signedUrl: string }>).map((s) => [
      s.path ?? "",
      s.signedUrl,
    ]),
  );

  // Miniatura leve para as listas e para o organizador: usa a miniatura já
  // gravada e, quando ela não existe, uma versão reduzida gerada pelo Storage.
  const thumbByRow = new Map<string, string>();
  const thumbPaths = rows
    .map((r) => r.thumbnail_storage_path)
    .filter((p): p is string => Boolean(p));
  if (thumbPaths.length) {
    const { data: signedThumbs } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(thumbPaths, 3600);
    const map = new Map(
      ((signedThumbs ?? []) as Array<{ path?: string | null; signedUrl: string }>).map((s) => [
        s.path ?? "",
        s.signedUrl,
      ]),
    );
    for (const r of rows) {
      const url = r.thumbnail_storage_path ? map.get(r.thumbnail_storage_path) : undefined;
      if (url) thumbByRow.set(r.id, url);
    }
  }
  await Promise.all(
    rows
      .filter((r) => !thumbByRow.has(r.id))
      .map(async (r) => {
        const path = r.processed_storage_path ?? r.storage_path;
        const { data: small } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 3600, {
            transform: { width: 480, height: 480, resize: "cover", quality: 60 },
          });
        if (small?.signedUrl) thumbByRow.set(r.id, small.signedUrl);
      }),
  );

  return rows.map((r) => {
    const url = byPath.get(r.processed_storage_path ?? r.storage_path) ?? "";
    return {
      id: r.id,
      url,
      thumbUrl: thumbByRow.get(r.id) ?? url,
      isCover: r.is_cover,
      position: r.position,
      processingStatus: (r.processing_status ?? "ready") as PropertyImage["processingStatus"],
      watermarkLabel: r.watermark_variant
        ? watermarkLabel(r.watermark_variant as WatermarkVariant)
        : null,
      processingError: r.processing_error_message,
    };
  });
}

async function listRows(supabase: Client, propertyId: string): Promise<ImageRow[]> {
  // Foto em exclusão pendente nos sites já não faz parte da galeria do Gestão.
  const { data, error } = await supabase
    .from("property_images")
    .select(IMAGE_COLUMNS)
    .eq("property_id", propertyId)
    .or("pending_remote_delete.is.null,pending_remote_delete.eq.false")
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImageRow[];
}

async function stableGallery(supabase: Client, propertyId: string): Promise<{ rows: ImageRow[]; revision: number }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const readRevision = async () => {
      const { data, error } = await supabase.from("properties").select("gallery_revision").eq("id", propertyId).single();
      if (error) throw new Error(error.message);
      return Number(data.gallery_revision ?? 1);
    };
    const before = await readRevision();
    const rows = await listRows(supabase, propertyId);
    const after = await readRevision();
    if (before === after) return { rows, revision: after };
  }
  throw new Error("A galeria está sendo alterada. Aguarde um instante.");
}

/**
 * Aciona o worker de marca-d'água sem prender a resposta do upload: a chamada
 * é disparada e abandonada em 1s — quem garante o resultado é a fila persistente
 * (o worker se reencadeia e o pg_cron é a rede de segurança).
 */
async function kickImageWorker(limit = 2) {
  try {
    const secret =
      workerCallerSecret();
    if (!secret) return;
    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : null;
    if (!origin) return;
    await fetch(`${origin}/api/public/hooks/property-image-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ limit }),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // pg_cron reprocessa no próximo ciclo
  }
}

export const listPropertyImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(
    async ({ data, context }): Promise<PropertyImage[]> =>
      signImages(context.supabase, await listRows(context.supabase, data.propertyId)),
  );

export const getPropertyGallerySnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<{ images: PropertyImage[]; revision: number }> => {
    const snapshot = await stableGallery(context.supabase, data.propertyId);
    return { images: await signImages(context.supabase, snapshot.rows), revision: snapshot.revision };
  });

export type PropertyImageUploadIssue = {
  fileName: string;
  reason: string;
  createdAt: string;
};

export const listPropertyImageUploadIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImageUploadIssue[]> => {
    const { data: issues, error } = await context.supabase.rpc(
      "property_image_upload_issues" as never,
      { _property_id: data.propertyId } as never,
    );
    if (error) {
      // Ajuste de banco 061000 ainda não aplicado: sem a lista, a tela segue normal.
      if (error.code === "PGRST202" || /schema cache|does not exist/i.test(error.message)) {
        return [];
      }
      throw new Error(error.message);
    }
    return Array.isArray(issues) ? issues as PropertyImageUploadIssue[] : [];
  });

/**
 * URLs assinadas de upload — os arquivos vão direto do navegador para o bucket
 * privado: o original preservado, a versão com a marca e a miniatura.
 */
export const createPropertyImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    propertyId: string; fileName: string;
    contentHash?: string; sizeBytes?: number; mimeType?: string | null;
    replacementFor?: string | null; batchId?: string | null;
  }) => data)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      path: string;
      token: string;
      reservationId: string | null;
      processed: { path: string; token: string };
      thumbnail: { path: string; token: string };
    }> => {
      const safe = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const id = crypto.randomUUID();
      const originalPath = `${data.propertyId}/originais/${id}-${safe}`;
      const sign = async (path: string) => {
        const { data: signed, error } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);
        if (error || !signed) throw new Error(error?.message ?? "Falha ao preparar o envio.");
        return { path: signed.path as string, token: signed.token as string };
      };
      const original = await sign(originalPath);
      const processed = await sign(`${data.propertyId}/marcadas/${id}.jpg`);
      const thumbnail = await sign(`${data.propertyId}/marcadas/${id}-thumb.jpg`);
      // Os tokens só saem desta função depois do commit da reserva. Se a
      // assinatura falhar, nenhum arquivo foi enviado nem há reserva órfã.
      let reservationId: string | null = null;
      if (data.contentHash && data.sizeBytes) {
        const { data: reserved, error: reserveError } = await context.supabase.rpc(
          "property_image_upload_reserve" as never, {
            _property_id: data.propertyId, _storage_path: originalPath,
            _file_name: data.fileName, _mime_type: data.mimeType ?? null,
            _size_bytes: data.sizeBytes, _content_hash: data.contentHash,
            _replacement_for: data.replacementFor ?? null,
            _batch_id: data.batchId ?? null,
          } as never,
        );
        if (reserveError) throw new Error(reserveError.message);
        if (typeof reserved !== "string") throw new Error("A intenção de upload não foi persistida.");
        reservationId = reserved;
      }
      return { path: original.path, token: original.token, reservationId, processed, thumbnail };
    },
  );

/** Confere que o arquivo chegou ao Storage e não ficou vazio. */
async function storedSize(supabase: Client, path: string): Promise<number> {
  const slash = path.lastIndexOf("/");
  const dir = slash > 0 ? path.slice(0, slash) : "";
  const name = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: name, limit: 100 });
  if (error) throw new Error(error.message);
  const found = ((data ?? []) as Array<{ name: string; metadata?: { size?: number } }>).find(
    (f) => f.name === name,
  );
  return found?.metadata?.size ?? 0;
}

/**
 * Registra a foto já enviada, evitando duplicatas pelo checksum.
 * A marca é composta no navegador; aqui só validamos e persistimos as versões.
 */
export const registerPropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      propertyId: string;
      storagePath: string;
      fileName: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
      contentHash: string;
      reservationId?: string | null;
      replacementFor?: string | null;
      batchId?: string | null;
      processedPath?: string | null;
      thumbnailPath?: string | null;
      processedChecksum?: string | null;
      watermarkVariant?: string | null;
      watermarkVersion?: string | null;
      destinationHash?: string | null;
      width?: number | null;
      height?: number | null;
    }) => data,
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      images: PropertyImage[];
      duplicated: boolean;
      resumed: boolean;
      imageId: string | null;
    }> => {
      const rows = await listRows(context.supabase, data.propertyId);
      if (!(await storedSize(context.supabase, data.storagePath))) {
        throw new Error("O arquivo ainda não chegou ao servidor. Selecione este arquivo novamente.");
      }

      if (data.reservationId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: reservation, error: reservationError } = await (supabaseAdmin as Client)
          .from("property_image_upload_reservations")
          .select("property_id, storage_path, uploaded_by")
          .eq("id", data.reservationId).maybeSingle();
        if (reservationError) throw new Error(reservationError.message);
        if (!reservation || reservation.property_id !== data.propertyId ||
            reservation.storage_path !== data.storagePath ||
            reservation.uploaded_by !== context.userId) {
          throw new Error("Reserva de upload não corresponde a este arquivo.");
        }
        const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc(
          "property_image_upload_finalize" as never,
          { _reservation_id: data.reservationId } as never,
        );
        if (finalizeError) throw new Error(finalizeError.message);
        const outcome = finalized as { status?: string; imageId?: string; reason?: string } | null;
        if (outcome?.status === "blocked") {
          throw new Error(outcome.reason === "foto_substituida_foi_removida"
            ? "A foto substituída foi removida durante o envio. O arquivo original foi preservado."
            : "O imóvel não está disponível para receber esta foto.");
        }
        if (!outcome?.imageId) throw new Error("A foto chegou, mas o registro ainda não foi confirmado.");
        if (outcome.status === "registered") {
          const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
          try {
            await enqueueImageJobs(supabaseAdmin, data.propertyId, { imageIds: [outcome.imageId] });
            await kickImageWorker(2);
          } catch (enqueueError) {
            console.error("[image_enqueue_deferred]", JSON.stringify({
              propertyId: data.propertyId, imageId: outcome.imageId,
              error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
            }));
          }
        }
        return {
          images: await signImages(context.supabase, await listRows(context.supabase, data.propertyId)),
          duplicated: outcome.status === "duplicated",
          resumed: false,
          imageId: outcome.imageId,
        };
      }

      // Versão com marca vinda do navegador: só vale se estiver mesmo no Storage.
      const buildReady = async () => {
        if (!data.processedPath) return null;
        const size = await storedSize(context.supabase, data.processedPath);
        if (!size) throw new Error("A foto com a marca não pôde ser confirmada. Tente de novo.");
        return {
          processed_storage_path: data.processedPath,
          thumbnail_storage_path: data.thumbnailPath ?? null,
          processed_checksum: data.processedChecksum ?? null,
          watermark_variant: data.watermarkVariant ?? "morar-cordial",
          watermark_version: data.watermarkVersion ?? "v1",
          destination_hash: data.destinationHash ?? null,
          processing_status: "ready",
          processing_error_code: null,
          processing_error_message: null,
          processed_at: new Date().toISOString(),
          processing_finished_at: new Date().toISOString(),
          width: data.width ?? null,
          height: data.height ?? null,
        };
      };
      const ready = await buildReady();

      const duplicate = data.replacementFor
        ? null
        : rows.find((r) => r.content_hash && r.content_hash === data.contentHash);
      if (duplicate) {
        const incomplete =
          duplicate.processing_status !== "ready" && duplicate.processing_status !== "legacy";
        if (incomplete && ready) {
          // Foto que estava presa na fila: adota a marca recém-gerada.
          const { error } = await context.supabase
            .from("property_images")
            .update(ready)
            .eq("id", duplicate.id)
            .eq("property_id", data.propertyId);
          if (error) throw new Error(error.message);
          const { error: cleanupError } = await context.supabase.storage.from(BUCKET).remove([data.storagePath]);
          if (cleanupError) console.warn("[duplicate_image_cleanup]", JSON.stringify({ propertyId: data.propertyId, error: cleanupError.message }));
        } else {
          await context.supabase.storage
            .from(BUCKET)
            .remove(
              [data.storagePath, data.processedPath, data.thumbnailPath].filter(
                (p): p is string => Boolean(p),
              ),
            );
        }
        // A foto já existente conta como item concluído do lote.
        if (data.batchId) await bumpBatch(context.supabase, data.batchId, "duplicated_count");
        return {
          images: await signImages(
            context.supabase,
            await listRows(context.supabase, data.propertyId),
          ),
          duplicated: true,
          resumed: incomplete && Boolean(ready),
          imageId: (duplicate?.id as string) ?? null,
        };
      }

      // Posição e capa são atribuídas dentro do banco, com bloqueio por imóvel:
      // 30 fotos enviadas ao mesmo tempo recebem 30 posições distintas.
      const { data: insertedId, error } = await (context.supabase as Client).rpc(
        data.replacementFor ? "property_image_stage_replacement" : "property_image_register", {
        _property_id: data.propertyId,
        ...(data.replacementFor ? { _old_image_id: data.replacementFor } : {}),
        _payload: {
          storage_path: data.storagePath,
          original_storage_path: data.storagePath,
          original_checksum: data.contentHash,
          file_name: data.fileName,
          mime_type: data.mimeType ?? null,
          size_bytes: data.sizeBytes ?? null,
          content_hash: data.contentHash,
          upload_status: "ready",
          uploaded_by: context.userId,
          batch_id: data.batchId ?? null,
          processing_status: ready ? "ready" : "pending",
          processed_storage_path: ready?.processed_storage_path ?? null,
          thumbnail_storage_path: ready?.thumbnail_storage_path ?? null,
          processed_checksum: ready?.processed_checksum ?? null,
          watermark_variant: ready?.watermark_variant ?? null,
          watermark_version: ready?.watermark_version ?? null,
          destination_hash: ready?.destination_hash ?? null,
          processed_at: ready?.processed_at ?? null,
          width: ready?.width ?? null,
          height: ready?.height ?? null,
        },
      });
      if (error) throw new Error(error.message);
      const newId = typeof insertedId === "string" ? insertedId : null;
      if (!newId) throw new Error("A foto foi enviada, mas não pôde ser registrada.");

      if (data.batchId) await bumpBatch(context.supabase, data.batchId, "registered_count");

      if (!ready && !data.replacementFor) {
        // Caminho de exceção (navegador sem canvas): a fila do servidor assume.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
        try {
          await enqueueImageJobs(supabaseAdmin, data.propertyId, { imageIds: [newId] });
          await kickImageWorker(2);
        } catch (enqueueError) {
          // O original e a linha da foto já estão duráveis. O watchdog do worker
          // encontra linhas pendentes sem job e recupera a entrega.
          console.error("[image_enqueue_deferred]", JSON.stringify({
            propertyId: data.propertyId, imageId: newId,
            error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
          }));
        }
      }

      return {
        images: await signImages(
          context.supabase,
          await listRows(context.supabase, data.propertyId),
        ),
        duplicated: false,
        resumed: false,
        imageId: newId,
      };
    },
  );

type BatchColumn = "registered_count" | "duplicated_count" | "failed_count";

/**
 * Incremento atômico no banco: uploads simultâneos não perdem contagem
 * (ler-somar-gravar no cliente perdia incrementos e o lote nunca fechava).
 */
async function bumpBatch(supabase: Client, batchId: string, column: BatchColumn) {
  const { error } = await supabase.rpc("property_image_batch_bump", {
    _batch_id: batchId,
    _column: column,
  });
  if (error) throw new Error(error.message);
}

export type ImageBatchState = {
  batchId: string;
  expected: number;
  registered: number;
  duplicated: number;
  failed: number;
  complete: boolean;
  status: string;
};

/**
 * Abre um lote de envio: o cadastro só considera as fotos concluídas quando
 * enviadas + duplicadas + com falha alcançam a quantidade selecionada — nenhuma
 * foto se perde em silêncio.
 */
export const openPropertyImageBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; expectedCount: number }) => data)
  .handler(async ({ data, context }): Promise<{ batchId: string }> => {
    const expected = Math.max(1, Math.floor(data.expectedCount));
    const { data: batch, error } = await context.supabase
      .from("property_image_batches")
      .insert({
        property_id: data.propertyId,
        expected_count: expected,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { batchId: batch.id as string };
  });

export const reportPropertyImageBatchFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchId: string }) => data)
  .handler(async ({ data, context }) => {
    await bumpBatch(context.supabase, data.batchId, "failed_count");
    return { ok: true };
  });

export const getPropertyImageBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchId: string }) => data)
  .handler(async ({ data, context }): Promise<ImageBatchState | null> => {
    const { data: batch } = await context.supabase
      .from("property_image_batches")
      .select("id, expected_count, registered_count, duplicated_count, failed_count, status")
      .eq("id", data.batchId)
      .maybeSingle();
    if (!batch) return null;
    const registered = Number(batch.registered_count ?? 0);
    const duplicated = Number(batch.duplicated_count ?? 0);
    const failed = Number(batch.failed_count ?? 0);
    const expected = Number(batch.expected_count ?? 0);
    return {
      batchId: batch.id as string,
      expected,
      registered,
      duplicated,
      failed,
      complete: registered + duplicated === expected && failed === 0,
      status: String(batch.status ?? "open"),
    };
  });

async function kickSyncWorker() {
  try {
    const secret =
      workerCallerSecret();
    if (!secret) return;
    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : null;
    if (!origin) return;
    // Fila de fotos tem worker próprio: um job por execução, nunca em lote.
    await fetch(`${origin}/api/public/hooks/property-media-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ passes: 2 }),
      signal: AbortSignal.timeout(1500),
    });

  } catch {
    // pg_cron reprocessa no próximo ciclo
  }
}

/** Persiste os destinos do imóvel e regenera as marcas quando eles mudam. */
export const setPropertyPublishTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; targets: string[] }) => data)
  .handler(async ({ data, context }): Promise<{ images: PropertyImage[]; variant: string }> => {
    const targets = normalizeTargets(data.targets);
    const { data: saved, error } = await context.supabase
      .from("properties")
      .update({ publish_targets: targets })
      .eq("id", data.propertyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Imóvel não encontrado ou sem permissão para alterar destinos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
    try {
      const result = await enqueueImageJobs(supabaseAdmin, data.propertyId, { targets });
      if (result.enqueued) await kickImageWorker(4);
    } catch (enqueueError) {
      // O gatilho de publish_targets deixou a derivação pendente na mesma
      // transação da escolha. O worker recupera fotos sem job.
      console.error("[image_targets_enqueue_deferred]", JSON.stringify({
        propertyId: data.propertyId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      }));
    }

    return {
      images: await signImages(context.supabase, await listRows(context.supabase, data.propertyId)),
      variant: variantForTargets(targets),
    };
  });

export const setPropertyImageCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string; expectedGalleryRevision?: number }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    // Invariante do sistema: a capa é sempre a posição 0. Marcar is_cover em
    // outra posição era desfeito pela normalização, então definir capa move a
    // foto para o início da galeria — uma única fonte de verdade.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await stableGallery(context.supabase, data.propertyId);
      if (!snapshot.rows.some((row) => row.id === data.imageId))
        throw new Error("A foto escolhida para capa foi removida da galeria.");
      const orderedIds = [data.imageId, ...snapshot.rows.map((row) => row.id).filter((id) => id !== data.imageId)];
      const { error } = await context.supabase.rpc("reorder_property_images", {
        _property_id: data.propertyId,
        _ids: orderedIds,
        _expected_gallery_revision: attempt === 0 ? data.expectedGalleryRevision ?? snapshot.revision : snapshot.revision,
      });
      if (!error) break;
      if (!/galeria_desatualizada/i.test(error.message) || attempt === 2) throw new Error(error.message);
    }
    // O gatilho da galeria grava a intenção de mídia na mesma transação.
    await kickSyncWorker();
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

/**
 * Salva a ordem inteira em uma única chamada ao banco (antes era uma por
 * foto), e não devolve a lista assinada — a tela já mostra a ordem correta.
 */
export const reorderPropertyImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; orderedIds: string[]; expectedGalleryRevision?: number; move?: GalleryMove | null }) => data)
  .handler(
    async ({ data, context }): Promise<{ ok: true; changed: number; coverId: string | null }> => {
      let ids = data.orderedIds;
      let expected = data.expectedGalleryRevision;
      let result: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (expected == null) expected = (await stableGallery(context.supabase, data.propertyId)).revision;
        const response = await context.supabase.rpc("reorder_property_images", {
          _property_id: data.propertyId,
          _ids: ids,
          _expected_gallery_revision: expected,
        });
        if (!response.error) {
          result = response.data;
          break;
        }
        if (!/galeria_desatualizada/i.test(response.error.message) || !data.move || attempt === 2)
          throw new Error(response.error.message);
        const snapshot = await stableGallery(context.supabase, data.propertyId);
        const rebased = rebaseGalleryMove(snapshot.rows.map((row) => row.id), data.move);
        if (!rebased.ok) throw new Error(`conflito_ordenacao: ${rebased.reason}`);
        ids = rebased.orderedIds;
        expected = snapshot.revision;
      }
      const payload = (result ?? {}) as { changed?: number; coverId?: string | null };
      await kickSyncWorker();
      return {
        ok: true,
        changed: Number(payload.changed ?? 0),
        coverId: payload.coverId ?? ids[0] ?? null,
      };
    },
  );


/**
 * Remove a foto.
 *
 * Correção 22/09/2026: quando a foto já foi enviada a algum site, o registro e o
 * arquivo NÃO são apagados de imediato. A foto sai da galeria do Gestão, cada
 * destino ganha um pedido de exclusão e só depois da confirmação em todos eles o
 * registro e os arquivos são apagados (`purgeFullyDeletedImages`). Isso permite
 * repetir a exclusão sem perder a referência da foto.
 */
export const deletePropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string; expectedGalleryRevision?: number }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const snapshot = await stableGallery(context.supabase, data.propertyId);
    if (!snapshot.rows.some((row) => row.id === data.imageId)) return signImages(context.supabase, snapshot.rows);
    const { data: result, error } = await (context.supabase as Client).rpc("property_image_delete_atomic", {
      _property_id: data.propertyId,
      _image_id: data.imageId,
      _expected_gallery_revision: data.expectedGalleryRevision ?? snapshot.revision,
    });
    if (error) throw new Error(error.message);
    const orphanPaths = ((result as { orphanStoragePaths?: string[] } | null)?.orphanStoragePaths ?? []).filter(Boolean);
    if (orphanPaths.length) {
      const removed = await context.supabase.storage.from(BUCKET).remove(orphanPaths);
      if (removed.error) console.warn("[image_storage_cleanup]", JSON.stringify({ propertyId: data.propertyId, imageId: data.imageId, error: removed.error.message }));
    }
    await kickSyncWorker();
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

/**
 * Substitui uma foto por outra já cadastrada (upload novo), em passos: a nova
 * assume a posição da antiga e a antiga entra em exclusão pendente. A foto
 * original é preservada até a confirmação da remoção em todos os sites.
 */
export const replacePropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; oldImageId: string; newImageId: string; expectedGalleryRevision?: number }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    let result: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await stableGallery(context.supabase, data.propertyId);
      if (!snapshot.rows.some((row) => row.id === data.oldImageId))
        throw new Error("A foto substituída foi removida durante a edição.");
      const response = await (context.supabase as Client).rpc("property_image_replace_atomic", {
        _property_id: data.propertyId,
        _old_image_id: data.oldImageId,
        _new_image_id: data.newImageId,
        _expected_gallery_revision: attempt === 0
          ? data.expectedGalleryRevision ?? snapshot.revision
          : snapshot.revision,
      });
      if (!response.error) { result = response.data; break; }
      if (!/galeria_desatualizada/i.test(response.error.message) || attempt === 2)
        throw new Error(response.error.message);
    }
    const orphanPaths = ((result as { orphanStoragePaths?: string[] } | null)?.orphanStoragePaths ?? []).filter(Boolean);
    if (orphanPaths.length) {
      const removed = await context.supabase.storage.from(BUCKET).remove(orphanPaths);
      if (removed.error) console.warn("[image_storage_cleanup]", JSON.stringify({ propertyId: data.propertyId, imageId: data.oldImageId, error: removed.error.message }));
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
    try {
      await enqueueImageJobs(supabaseAdmin, data.propertyId, { imageIds: [data.newImageId] });
      await kickImageWorker(1);
    } catch (enqueueError) {
      // O original e a intenção de galeria sobreviveram; o watchdog encontra
      // a foto ativa pendente caso este kick ou o enfileiramento falhem.
      console.error("[replacement_image_enqueue_deferred]", JSON.stringify({
        propertyId: data.propertyId, imageId: data.newImageId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      }));
    }
    await kickSyncWorker();
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });
