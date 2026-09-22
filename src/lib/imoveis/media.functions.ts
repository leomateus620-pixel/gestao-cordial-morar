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
  const { data, error } = await supabase
    .from("property_images")
    .select(IMAGE_COLUMNS)
    .eq("property_id", propertyId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImageRow[];
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

/**
 * URLs assinadas de upload — os arquivos vão direto do navegador para o bucket
 * privado: o original preservado, a versão com a marca e a miniatura.
 */
export const createPropertyImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; fileName: string }) => data)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      path: string;
      token: string;
      processed: { path: string; token: string };
      thumbnail: { path: string; token: string };
    }> => {
      const safe = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const id = crypto.randomUUID();
      const sign = async (path: string) => {
        const { data: signed, error } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);
        if (error || !signed) throw new Error(error?.message ?? "Falha ao preparar o envio.");
        return { path: signed.path as string, token: signed.token as string };
      };
      const original = await sign(`${data.propertyId}/originais/${id}-${safe}`);
      const processed = await sign(`${data.propertyId}/marcadas/${id}.jpg`);
      const thumbnail = await sign(`${data.propertyId}/marcadas/${id}-thumb.jpg`);
      return { path: original.path, token: original.token, processed, thumbnail };
    },
  );

/** Confere que o arquivo chegou ao Storage e não ficou vazio. */
async function storedSize(supabase: Client, path: string): Promise<number> {
  const slash = path.lastIndexOf("/");
  const dir = slash > 0 ? path.slice(0, slash) : "";
  const name = path.slice(slash + 1);
  const { data } = await supabase.storage.from(BUCKET).list(dir, { search: name, limit: 100 });
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
    }): Promise<{ images: PropertyImage[]; duplicated: boolean; resumed: boolean }> => {
      const rows = await listRows(context.supabase, data.propertyId);

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

      const duplicate = rows.find((r) => r.content_hash && r.content_hash === data.contentHash);
      if (duplicate) {
        const incomplete =
          duplicate.processing_status !== "ready" && duplicate.processing_status !== "legacy";
        if (incomplete && ready) {
          // Foto que estava presa na fila: adota a marca recém-gerada.
          await context.supabase.storage.from(BUCKET).remove([data.storagePath]);
          const { error } = await context.supabase
            .from("property_images")
            .update(ready)
            .eq("id", duplicate.id)
            .eq("property_id", data.propertyId);
          if (error) throw new Error(error.message);
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
        };
      }

      // Posição e capa são atribuídas dentro do banco, com bloqueio por imóvel:
      // 30 fotos enviadas ao mesmo tempo recebem 30 posições distintas.
      const { data: insertedId, error } = await context.supabase.rpc("property_image_register", {
        _property_id: data.propertyId,
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

      if (!ready) {
        // Caminho de exceção (navegador sem canvas): a fila do servidor assume.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
        await enqueueImageJobs(supabaseAdmin, data.propertyId, { imageIds: [newId] });
        await kickImageWorker(2);
      }

      return {
        images: await signImages(
          context.supabase,
          await listRows(context.supabase, data.propertyId),
        ),
        duplicated: false,
        resumed: false,
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

/** Enfileira a sincronização de fotos dos sites já publicados (nunca o cadastro). */
async function queueMedia(propertyId: string, userId?: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queueMediaSync } = await import("@/lib/imobibrasil/media-sync.server");
    const result = await queueMediaSync(supabaseAdmin, propertyId, {
      requestedBy: userId ?? null,
    });
    if (result.enqueued.length) await kickSyncWorker();
    return result;
  } catch {
    // A fila persistente e o pg_cron garantem o reenvio.
    return { enqueued: [] as string[], galleryRevision: 0 };
  }
}

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

/** Sincroniza a galeria com os sites sob demanda (fotos apenas). */
export const syncPropertyGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }) => queueMedia(data.propertyId, context.userId));

/** Persiste os destinos do imóvel e regenera as marcas quando eles mudam. */
export const setPropertyPublishTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; targets: string[] }) => data)
  .handler(async ({ data, context }): Promise<{ images: PropertyImage[]; variant: string }> => {
    const targets = normalizeTargets(data.targets);
    const { error } = await context.supabase
      .from("properties")
      .update({ publish_targets: targets })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
    const result = await enqueueImageJobs(supabaseAdmin, data.propertyId, { targets });
    if (result.enqueued) await kickImageWorker(4);

    return {
      images: await signImages(context.supabase, await listRows(context.supabase, data.propertyId)),
      variant: variantForTargets(targets),
    };
  });

/** Reprocessa fotos com falha (ou uma foto específica) a partir do original. */
export const retryPropertyImageWatermark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId?: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
    const rows = await listRows(context.supabase, data.propertyId);
    const retryable = ["failed", "failed_retryable", "failed_permanent", "pending", "processing"];
    const ids = data.imageId
      ? [data.imageId]
      : rows.filter((r) => retryable.includes(r.processing_status)).map((r) => r.id);
    if (ids.length) {
      await supabaseAdmin
        .from("property_image_jobs")
        .update({ status: "cancelled", last_error_code: "manual_retry" })
        .in("image_id", ids)
        .in("status", ["pending", "processing", "retry", "failed"]);
      await supabaseAdmin
        .from("property_images")
        .update({
          destination_hash: null,
          processing_status: "pending",
          processing_error_message: null,
        })
        .in("id", ids);
      await enqueueImageJobs(supabaseAdmin, data.propertyId, { imageIds: ids });
      await kickImageWorker(2);
    }

    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

export const setPropertyImageCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    // Invariante do sistema: a capa é sempre a posição 0. Marcar is_cover em
    // outra posição era desfeito pela normalização, então definir capa move a
    // foto para o início da galeria — uma única fonte de verdade.
    const rows = await listRows(context.supabase, data.propertyId);
    if (!rows.some((row) => row.id === data.imageId)) return signImages(context.supabase, rows);
    const orderedIds = [
      data.imageId,
      ...rows.map((row) => row.id as string).filter((id) => id !== data.imageId),
    ];
    const { error } = await context.supabase.rpc("reorder_property_images", {
      _property_id: data.propertyId,
      _ids: orderedIds,
    });
    if (error) throw new Error(error.message);
    // Fotos apenas: nunca reenvia a mesma imagem só por causa do destaque (o
    // site não tem recurso de alterar destaque e criaria uma cópia).
    await queueMedia(data.propertyId, context.userId);
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

/**
 * Salva a ordem inteira em uma única chamada ao banco (antes era uma por
 * foto), e não devolve a lista assinada — a tela já mostra a ordem correta.
 */
export const reorderPropertyImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; orderedIds: string[] }) => data)
  .handler(
    async ({ data, context }): Promise<{ ok: true; changed: number; coverId: string | null }> => {
      const { data: result, error } = await context.supabase.rpc("reorder_property_images", {
        _property_id: data.propertyId,
        _ids: data.orderedIds,
      });
      if (error) throw new Error(error.message);
      const payload = (result ?? {}) as { changed?: number; coverId?: string | null };
      // A nova ordem é uma mudança de mídia: entra na fila só de fotos.
      if (Number(payload.changed ?? 0) > 0) await queueMedia(data.propertyId, context.userId);
      return {
        ok: true,
        changed: Number(payload.changed ?? 0),
        coverId: payload.coverId ?? data.orderedIds[0] ?? null,
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
  .inputValidator((data: { propertyId: string; imageId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const rows = await listRows(context.supabase, data.propertyId);
    const target = rows.find((r) => r.id === data.imageId);
    if (!target) return signImages(context.supabase, rows);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: links } = await supabaseAdmin
      .from("property_image_provider_publications")
      .select("id, publication_id, deleted_at")
      .eq("image_id", data.imageId);
    const pendingRemote = (links ?? []).filter((row) => !row.deleted_at);

    if (pendingRemote.length > 0) {
      await supabaseAdmin
        .from("property_image_provider_publications")
        .update({
          desired_state: "absent",
          pending_delete_at: new Date().toISOString(),
          status: "pending_delete",
          attempts: 0,
          next_retry_at: null,
        })
        .in(
          "id",
          pendingRemote.map((row) => row.id as string),
        );
      await supabaseAdmin
        .from("property_images")
        .update({ pending_remote_delete: true, is_cover: false })
        .eq("id", data.imageId)
        .eq("property_id", data.propertyId);
    } else {
      const { error } = await context.supabase
        .from("property_images")
        .delete()
        .eq("id", data.imageId)
        .eq("property_id", data.propertyId);
      if (error) throw new Error(error.message);
      const removable = [
        target.storage_path,
        target.original_storage_path,
        target.processed_storage_path,
        target.thumbnail_storage_path,
      ].filter((path, index, all): path is string => Boolean(path) && all.indexOf(path) === index);
      await context.supabase.storage.from(BUCKET).remove(removable);
    }

    // Renumera 0..N-1 e devolve a capa para a primeira foto restante.
    await context.supabase.rpc("property_images_normalize", { _property_id: data.propertyId });
    // Exclusão local vira exclusão nos sites pelo endpoint oficial por código.
    await queueMedia(data.propertyId, context.userId);
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

/**
 * Substitui uma foto por outra já cadastrada (upload novo), em passos: a nova
 * assume a posição da antiga e a antiga entra em exclusão pendente. A foto
 * original é preservada até a confirmação da remoção em todos os sites.
 */
export const replacePropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; oldImageId: string; newImageId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const rows = await listRows(context.supabase, data.propertyId);
    const old = rows.find((row) => row.id === data.oldImageId);
    const fresh = rows.find((row) => row.id === data.newImageId);
    if (!old || !fresh) return signImages(context.supabase, rows);

    const orderedIds = rows
      .map((row) => row.id as string)
      .filter((id) => id !== data.newImageId)
      .flatMap((id) => (id === data.oldImageId ? [data.newImageId, id] : [id]));
    const { error: orderError } = await context.supabase.rpc("reorder_property_images", {
      _property_id: data.propertyId,
      _ids: orderedIds,
    });
    if (orderError) throw new Error(orderError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: links } = await supabaseAdmin
      .from("property_image_provider_publications")
      .select("id, deleted_at")
      .eq("image_id", data.oldImageId);
    const pendingRemote = (links ?? []).filter((row) => !row.deleted_at);
    if (pendingRemote.length > 0) {
      await supabaseAdmin
        .from("property_image_provider_publications")
        .update({
          desired_state: "absent",
          pending_delete_at: new Date().toISOString(),
          status: "pending_delete",
          replacement_of_image_id: data.newImageId,
          attempts: 0,
          next_retry_at: null,
        })
        .in(
          "id",
          pendingRemote.map((row) => row.id as string),
        );
      await supabaseAdmin
        .from("property_images")
        .update({ pending_remote_delete: true, is_cover: false })
        .eq("id", data.oldImageId)
        .eq("property_id", data.propertyId);
    } else {
      await context.supabase
        .from("property_images")
        .delete()
        .eq("id", data.oldImageId)
        .eq("property_id", data.propertyId);
    }

    await context.supabase.rpc("property_images_normalize", { _property_id: data.propertyId });
    await queueMedia(data.propertyId, context.userId);
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });


/**
 * Prepara o reprocessamento das fotos travadas: o runtime publicado não pode
 * compilar WebAssembly, então a marca é refeita no navegador a partir do
 * original já guardado no Storage.
 */
export const preparePropertyImageReprocess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId?: string }) => data)
  .handler(
    async ({
      data,
      context,
    }): Promise<
      Array<{
        imageId: string;
        fileName: string;
        downloadUrl: string;
        processed: { path: string; token: string };
        thumbnail: { path: string; token: string };
      }>
    > => {
      const rows = await listRows(context.supabase, data.propertyId);
      const stuck = ["pending", "processing", "failed", "failed_retryable", "failed_permanent"];
      const targets = rows.filter(
        (row) =>
          (data.imageId ? row.id === data.imageId : true) && stuck.includes(row.processing_status),
      );
      if (!targets.length) return [];

      const sourcePaths = targets.map((row) => row.original_storage_path ?? row.storage_path);
      const { data: signed } = await context.supabase.storage
        .from(BUCKET)
        .createSignedUrls(sourcePaths, 1800);
      const byPath = new Map(
        ((signed ?? []) as Array<{ path?: string | null; signedUrl: string }>).map((item) => [
          item.path ?? "",
          item.signedUrl,
        ]),
      );

      const sign = async (path: string) => {
        const { data: upload, error } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);
        if (error || !upload) throw new Error(error?.message ?? "Falha ao preparar o reenvio.");
        return { path: upload.path as string, token: upload.token as string };
      };

      const out: Array<{
        imageId: string;
        fileName: string;
        downloadUrl: string;
        processed: { path: string; token: string };
        thumbnail: { path: string; token: string };
      }> = [];
      for (const row of targets) {
        const source = row.original_storage_path ?? row.storage_path;
        const downloadUrl = byPath.get(source);
        if (!downloadUrl) continue;
        const stamp = `${row.id}-${Date.now()}`;
        out.push({
          imageId: row.id,
          fileName: row.file_name,
          downloadUrl,
          processed: await sign(`${data.propertyId}/marcadas/${stamp}.jpg`),
          thumbnail: await sign(`${data.propertyId}/marcadas/${stamp}-thumb.jpg`),
        });
      }
      return out;
    },
  );

/** Registra a foto remarcada no navegador e libera a publicação nos sites. */
export const finalizePropertyImageReprocess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      propertyId: string;
      imageId: string;
      processedPath: string;
      thumbnailPath: string;
      processedChecksum: string;
      watermarkVariant: string;
      watermarkVersion: string;
      destinationHash: string;
      width: number;
      height: number;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const size = await storedSize(context.supabase, data.processedPath);
    if (!size) throw new Error("A foto com a marca não pôde ser confirmada. Tente de novo.");

    const { error } = await context.supabase
      .from("property_images")
      .update({
        processed_storage_path: data.processedPath,
        thumbnail_storage_path: data.thumbnailPath,
        processed_checksum: data.processedChecksum,
        watermark_variant: data.watermarkVariant,
        watermark_version: data.watermarkVersion,
        destination_hash: data.destinationHash,
        processing_status: "ready",
        processing_error_code: null,
        processing_error_message: null,
        processed_at: new Date().toISOString(),
        processing_finished_at: new Date().toISOString(),
        width: data.width,
        height: data.height,
      })
      .eq("id", data.imageId)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("property_image_jobs")
      .update({ status: "cancelled", last_error_code: "reprocessado_no_navegador" })
      .eq("image_id", data.imageId)
      .in("status", ["pending", "processing", "retry", "failed"]);

    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });
