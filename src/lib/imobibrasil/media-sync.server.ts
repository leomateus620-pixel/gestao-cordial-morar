/**
 * Caminho exclusivo de MÍDIA das publicações (server-only).
 *
 * Este módulo fala apenas com os recursos de imagem do imóvel
 * (`/imovel/{id}/imagem/lista` e `/imovel/{id}/imagem/inserir`). Ele NUNCA
 * chama `/imovel/alterar`, não monta `serializeProperty` e não lê nem grava
 * vínculos de proprietário/corretor — por isso continua liberado mesmo com a
 * trava `imobi_update_sync_paused` ligada, que protege o cadastro.
 *
 * Ordem: a fonte da verdade é `property_images` ordenado por `position`. Como a
 * API só permite inserir, o envio é SEQUENCIAL (posição 0 → confirmação →
 * posição 1 → …) e a posição enviada de cada foto fica registrada em
 * `property_image_provider_publications.synced_position`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractExternalId, imobiRequest } from "./client.server";
import { toImobiError } from "./errors";
import { boolToImageSimNao } from "./serializers";
import { fetchPropertyImages } from "./read.server";
import { acquireProviderSlot } from "./rate-limit.server";
import type { ImobiProvider } from "./providers";
import { canPublishPropertyImage } from "@/lib/imoveis/image-status";
import { classifyImageDeliveryError, nextImageRetryAt } from "@/lib/imoveis/delivery";
import { fetchDeliveryBytes } from "@/lib/imoveis/delivery.server";
import {
  isExtensionError,
  isRateLimitError,
  planGalleryDelivery,
  safeDeliveryFileName,
  sortGallery,
  type LocalGalleryImage,
  type RemoteGalleryRow,
} from "@/lib/imoveis/gallery-plan";

type Admin = SupabaseClient;

const BUCKET = "property-images";

/** Foto travada há mais tempo que isso não segura mais o envio da galeria. */
const STUCK_IMAGE_WINDOW_MS = 15 * 60 * 1000;

export type MediaSyncResult = {
  propertyId: string;
  provider: ImobiProvider;
  correlationId: string;
  galleryRevision: number;
  expectedCount: number;
  sentCount: number;
  alreadySyncedCount: number;
  failedCount: number;
  waitingCount: number;
  remoteCount: number | null;
  orderGuarantee: string;
  orderDrift: boolean;
  coverDrift: boolean;
  status: "synced" | "partial" | "order_drift" | "waiting_watermark" | "not_published";
  durationMs: number;
  order: Array<{ imageId: string; position: number; externalImageId?: string | null }>;
  errors: Array<{ imageId: string; message: string }>;
};

type ImageRow = {
  id: string;
  storage_path: string;
  processed_storage_path: string | null;
  processed_checksum: string | null;
  content_hash: string | null;
  file_name: string;
  mime_type: string | null;
  is_cover: boolean;
  position: number;
  processing_status: string;
  processing_started_at: string | null;
  updated_at: string | null;
};

async function loadImages(admin: Admin, propertyId: string): Promise<ImageRow[]> {
  const { data, error } = await admin
    .from("property_images")
    .select(
      "id, storage_path, processed_storage_path, processed_checksum, content_hash, file_name, mime_type, is_cover, position, processing_status, processing_started_at, updated_at",
    )
    .eq("property_id", propertyId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImageRow[];
}

function deliveredHash(image: ImageRow): string | null {
  return image.processed_checksum ?? image.content_hash ?? null;
}

function toLocal(image: ImageRow): LocalGalleryImage {
  return {
    id: image.id,
    position: image.position,
    isCover: Boolean(image.is_cover),
    deliveredHash: deliveredHash(image),
  };
}

/**
 * Envia a galeria ao site e registra as métricas.
 * Usado tanto pelo job de mídia quanto pelo publish/update (na etapa de fotos).
 */
export async function deliverGallery(
  admin: Admin,
  params: {
    propertyId: string;
    provider: ImobiProvider;
    publicationId: string;
    externalId: string;
    correlationId: string;
    galleryRevision?: number;
    verifyRemote?: boolean;
  },
): Promise<MediaSyncResult> {
  const started = Date.now();
  const { propertyId, provider, publicationId, externalId, correlationId } = params;

  let galleryRevision = params.galleryRevision ?? 0;
  if (!galleryRevision) {
    const { data: property } = await admin
      .from("properties")
      .select("gallery_revision")
      .eq("id", propertyId)
      .maybeSingle();
    galleryRevision = Number(property?.gallery_revision ?? 1);
  }

  const all = await loadImages(admin, propertyId);
  const now = Date.now();
  const inFlight = all.filter((image) => {
    if (!["pending", "processing"].includes(String(image.processing_status))) return false;
    const since = image.processing_started_at ?? image.updated_at;
    const age = since ? now - new Date(since).getTime() : 0;
    return age < STUCK_IMAGE_WINDOW_MS;
  }).length;

  const publishable = sortGallery(all.filter(canPublishPropertyImage).map(toLocal));
  const byId = new Map(all.map((image) => [image.id, image]));

  const { data: remoteRows } = await admin
    .from("property_image_provider_publications")
    .select(
      "image_id, content_hash, status, synced_position, is_cover, attempts, next_retry_at, external_image_id",
    )
    .eq("publication_id", publicationId);

  const plan = planGalleryDelivery(
    publishable,
    (remoteRows ?? []) as unknown as RemoteGalleryRow[],
    now,
  );

  const errors: Array<{ imageId: string; message: string }> = [];
  const order: MediaSyncResult["order"] = [];
  let sentCount = 0;
  let failedCount = 0;

  // Envio SEQUENCIAL: a ordem remota é a ordem de inserção.
  for (const target of plan.toSend) {
    const image = byId.get(target.id);
    if (!image) continue;
    const existing = (remoteRows ?? []).find((row) => row.image_id === image.id);
    const previousAttempts = Number(existing?.attempts ?? 0);

    try {
      await acquireProviderSlot(admin, provider);
      const converted = Boolean(image.processed_storage_path);
      const deliveryPath = image.processed_storage_path ?? image.storage_path;
      const delivery = await fetchDeliveryBytes(admin, BUCKET, deliveryPath);
      const fileName = safeDeliveryFileName(image.id, {
        converted,
        originalName: image.file_name,
        mimeType: converted ? "image/jpeg" : image.mime_type,
      });
      const form = new FormData();
      form.append(
        "imagem",
        new Blob([await delivery.blob.arrayBuffer()], { type: "image/jpeg" }),
        fileName,
      );
      form.append("destaque", boolToImageSimNao(Boolean(image.is_cover)));

      const response = await imobiRequest(
        provider,
        `/imovel/${encodeURIComponent(externalId)}/imagem/inserir`,
        {
          method: "POST",
          formData: form,
          extraHeaders: { codigoImovel: externalId },
          correlationId,
          timeoutMs: 90_000,
          retryOnNetwork: true,
        },
      );

      const externalImageId = extractExternalId(response.data);
      await admin.from("property_image_provider_publications").upsert(
        {
          image_id: image.id,
          publication_id: publicationId,
          provider,
          external_image_id: externalImageId,
          content_hash: deliveredHash(image),
          is_cover: Boolean(image.is_cover),
          synced_position: image.position,
          delivery_file_name: fileName,
          status: "synced",
          last_error_message: null,
          error_class: null,
          attempts: 0,
          next_retry_at: null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "image_id,publication_id" },
      );
      sentCount += 1;
      order.push({ imageId: image.id, position: image.position, externalImageId });
    } catch (error) {
      failedCount += 1;
      const normalized = toImobiError(error);
      const attempts = previousAttempts + 1;
      // Erros de extensão e de limite são corrigíveis pelo próprio pipeline:
      // voltam à fila em vez de ficarem parados para sempre.
      const errorClass = isExtensionError(normalized.message)
        ? "provedor"
        : isRateLimitError(normalized.message)
          ? "rede"
          : classifyImageDeliveryError(normalized.message);
      const retryAt = nextImageRetryAt(errorClass, attempts);
      errors.push({ imageId: image.id, message: normalized.message });
      await admin.from("property_image_provider_publications").upsert(
        {
          image_id: image.id,
          publication_id: publicationId,
          provider,
          content_hash: deliveredHash(image),
          is_cover: Boolean(image.is_cover),
          delivery_file_name: safeDeliveryFileName(image.id, { converted: true }),
          status: "error",
          last_error_message: normalized.message,
          error_class: errorClass,
          attempts,
          next_retry_at: retryAt,
        },
        { onConflict: "image_id,publication_id" },
      );
      // Limite de requisições: para o lote agora e retoma no próximo ciclo.
      if (isRateLimitError(normalized.message)) break;
    }
  }

  // Reconciliação: quantas fotos o site realmente tem agora.
  let remoteCount: number | null = null;
  if (params.verifyRemote !== false) {
    try {
      await acquireProviderSlot(admin, provider);
      const remote = await fetchPropertyImages(provider, externalId, correlationId);
      remoteCount = remote.length;
    } catch {
      remoteCount = null;
    }
  }

  const syncedTotal = plan.syncedCount + sentCount;
  const complete = syncedTotal === plan.expectedCount && failedCount === 0;
  const status: MediaSyncResult["status"] = inFlight
    ? "waiting_watermark"
    : complete && (plan.orderDrift || plan.coverDrift)
      ? "order_drift"
      : complete
        ? "synced"
        : "partial";

  // Nível de garantia REAL, sem inventar confirmação: a API só permite listar e
  // inserir, então a ordem é garantida na inserção e a paridade é conferida por
  // quantidade — não há como reposicionar nem excluir foto remota.
  const orderGuarantee =
    remoteCount === null
      ? "insercao_sem_verificacao"
      : plan.orderDrift
        ? "insercao_com_divergencia"
        : "insercao_verificada_por_quantidade";

  await admin
    .from("property_provider_publications")
    .update({
      gallery_revision: galleryRevision,
      ...(status === "synced" ? { synced_gallery_revision: galleryRevision } : {}),
      media_expected_count: plan.expectedCount,
      media_synced_count: syncedTotal,
      media_failed_count: failedCount + plan.failedCount,
      media_remote_count: remoteCount,
      media_status: status,
      media_order_guarantee: orderGuarantee,
      last_media_synced_at: new Date().toISOString(),
      ...(remoteCount !== null ? { last_media_verified_at: new Date().toISOString() } : {}),
    })
    .eq("id", publicationId);

  const result: MediaSyncResult = {
    propertyId,
    provider,
    correlationId,
    galleryRevision,
    expectedCount: plan.expectedCount,
    sentCount,
    alreadySyncedCount: plan.syncedCount,
    failedCount,
    waitingCount: plan.waiting.length,
    remoteCount,
    orderGuarantee,
    orderDrift: plan.orderDrift,
    coverDrift: plan.coverDrift,
    status,
    durationMs: Date.now() - started,
    order: publishable.map((image) => ({ imageId: image.id, position: image.position })),
    errors,
  };

  // Log estruturado e auditável do envio de mídia.
  console.info("[media_sync]", JSON.stringify({ ...result, order: order.length ? order : undefined }));
  return result;
}

/** Executa um job `media_sync` — nunca toca no cadastro do imóvel. */
export async function syncPropertyMedia(
  admin: Admin,
  job: {
    id: string;
    property_id: string;
    provider: ImobiProvider;
    correlation_id: string;
    requested_revision: number;
  },
): Promise<MediaSyncResult | { status: "not_published" }> {
  const { data: publication } = await admin
    .from("property_provider_publications")
    .select("id, external_property_id, enabled, status")
    .eq("property_id", job.property_id)
    .eq("provider", job.provider)
    .maybeSingle();

  if (!publication?.external_property_id || publication.enabled === false) {
    return { status: "not_published" };
  }

  return deliverGallery(admin, {
    propertyId: job.property_id,
    provider: job.provider,
    publicationId: publication.id as string,
    externalId: publication.external_property_id as string,
    correlationId: job.correlation_id,
    galleryRevision: job.requested_revision,
  });
}

/**
 * Enfileira sincronização de mídia para os sites em que o imóvel já está
 * publicado. Idempotente: um job por (imóvel, site, versão da galeria).
 */
export async function queueMediaSync(
  admin: Admin,
  propertyId: string,
  options: { providers?: string[]; requestedBy?: string | null } = {},
): Promise<{ enqueued: string[]; galleryRevision: number }> {
  const { data: property } = await admin
    .from("properties")
    .select("gallery_revision, is_draft, archived_at")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property || property.is_draft || property.archived_at) {
    return { enqueued: [], galleryRevision: Number(property?.gallery_revision ?? 1) };
  }
  const galleryRevision = Number(property.gallery_revision ?? 1);

  const { data: publications } = await admin
    .from("property_provider_publications")
    .select("provider, external_property_id, enabled")
    .eq("property_id", propertyId);

  const targets = (publications ?? [])
    .filter((row) => row.enabled !== false && row.external_property_id)
    .map((row) => String(row.provider))
    .filter((provider) => !options.providers?.length || options.providers.includes(provider));
  if (!targets.length) return { enqueued: [], galleryRevision };

  for (const provider of targets) {
    await admin.from("property_sync_jobs").upsert(
      {
        property_id: propertyId,
        provider,
        action: "media_sync",
        requested_revision: galleryRevision,
        requested_by: options.requestedBy ?? null,
        status: "pending",
        attempts: 0,
        next_run_at: new Date().toISOString(),
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
        last_error_message: null,
        last_error_category: null,
      },
      { onConflict: "property_id,provider,action,requested_revision", ignoreDuplicates: false },
    );
  }
  return { enqueued: targets, galleryRevision };
}
