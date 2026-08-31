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
  return rows.map((r) => ({
    id: r.id,
    url: byPath.get(r.processed_storage_path ?? r.storage_path) ?? "",
    isCover: r.is_cover,
    position: r.position,
    processingStatus: (r.processing_status ?? "ready") as PropertyImage["processingStatus"],
    watermarkLabel: r.watermark_variant
      ? watermarkLabel(r.watermark_variant as WatermarkVariant)
      : null,
    processingError: r.processing_error_message,
  }));
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
      process.env["PROPERTY_SYNC_WORKER_SECRET"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
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
        return {
          images: await signImages(
            context.supabase,
            await listRows(context.supabase, data.propertyId),
          ),
          duplicated: true,
          resumed: incomplete && Boolean(ready),
        };
      }

      // Envios simultâneos disputam a posição e a capa (índice único de capa).
      // Recalculamos e tentamos de novo em vez de falhar a foto do corretor.
      let current = rows;
      let inserted: { id: string } | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < 6 && !inserted; attempt += 1) {
        const position = current.length ? Math.max(...current.map((r) => r.position)) + 1 : 0;
        const { data: row, error } = await context.supabase
          .from("property_images")
          .insert({
            property_id: data.propertyId,
            storage_path: data.storagePath,
            original_storage_path: data.storagePath,
            original_checksum: data.contentHash,
            file_name: data.fileName,
            mime_type: data.mimeType ?? null,
            size_bytes: data.sizeBytes ?? null,
            content_hash: data.contentHash,
            position,
            is_cover: current.length === 0,
            upload_status: "ready",
            processing_status: "pending",
            uploaded_by: context.userId,
            ...(ready ?? {}),
          })
          .select("id")
          .maybeSingle();
        if (!error && row?.id) {
          inserted = row;
          break;
        }
        lastError = error?.message ?? "A foto foi enviada, mas não pôde ser registrada.";
        const conflict = error?.code === "23505" || /duplicate key/i.test(lastError);
        if (!conflict) throw new Error(lastError);
        await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
        current = await listRows(context.supabase, data.propertyId);
      }
      if (!inserted?.id) throw new Error(lastError || "A foto não pôde ser registrada.");


      if (!ready) {
        // Caminho de exceção (navegador sem canvas): a fila do servidor assume.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
        await enqueueImageJobs(supabaseAdmin, data.propertyId, { imageIds: [inserted.id] });
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
    // O índice único garante uma capa por imóvel: zera antes de marcar a nova.
    await context.supabase
      .from("property_images")
      .update({ is_cover: false })
      .eq("property_id", data.propertyId)
      .eq("is_cover", true);
    const { error } = await context.supabase
      .from("property_images")
      .update({ is_cover: true })
      .eq("id", data.imageId)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

export const reorderPropertyImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; orderedIds: string[] }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    for (let i = 0; i < data.orderedIds.length; i += 1) {
      const id = data.orderedIds[i]!;
      const { error } = await context.supabase
        .from("property_images")
        .update({ position: i })
        .eq("id", id)
        .eq("property_id", data.propertyId);
      if (error) throw new Error(error.message);
    }
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });

/**
 * Remove a foto: o arquivo só sai do Storage depois que o registro é apagado,
 * e a capa é reatribuída para a primeira foto restante.
 */
export const deletePropertyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyImage[]> => {
    const rows = await listRows(context.supabase, data.propertyId);
    const target = rows.find((r) => r.id === data.imageId);
    if (!target) return signImages(context.supabase, rows);

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

    const remaining = await listRows(context.supabase, data.propertyId);
    if (target.is_cover && remaining.length) {
      await context.supabase
        .from("property_images")
        .update({ is_cover: true })
        .eq("id", remaining[0]!.id);
    }
    return signImages(context.supabase, await listRows(context.supabase, data.propertyId));
  });
