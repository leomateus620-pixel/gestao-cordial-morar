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
  analyzeRemoteGallery,
  isAmbiguousDeliveryError,
  isExtensionError,
  isRateLimitError,
  planGalleryDelivery,
  safeDeliveryFileName,
  shouldSendAsCover,
  sortGallery,
  type LocalGalleryImage,
  type RemoteGalleryRow,
  type RemoteGallerySnapshot,
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
  remoteCoverCount: number | null;
  multipleRemoteCovers: boolean;
  unknownCount: number;
  contentDriftCount: number;
  orderGuarantee: string;
  orderDrift: boolean;
  coverDrift: boolean;
  status:
    | "synced"
    | "partial"
    | "order_drift"
    | "waiting_watermark"
    | "remote_multiple_covers"
    | "delivery_unknown"
    | "not_published";
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
  let unknownCount = plan.unknown.length;

  /**
   * Leitura da galeria do site ANTES de inserir. Dois usos:
   *  - saber se já existe destaque (2+ destaques fazem o site repetir o mesmo
   *    imóvel na listagem — foi exatamente o sintoma relatado);
   *  - ter a contagem conhecida para conferir entregas ambíguas por leitura.
   */
  async function readRemoteGallery(): Promise<RemoteGallerySnapshot | null> {
    try {
      await acquireProviderSlot(admin, provider);
      const remote = await fetchPropertyImages(provider, externalId, correlationId);
      return analyzeRemoteGallery(remote as unknown as Record<string, unknown>[]);
    } catch {
      return null;
    }
  }

  let snapshot = await readRemoteGallery();
  let knownRemoteCount = snapshot?.count ?? null;
  let coversSentThisRun = 0;

  // Fotos já sincronizadas cujo binário mudou depois do envio: registra a
  // divergência, mas NUNCA reenvia (o site só insere — reenviar cria cópia).
  for (const imageId of plan.contentDrift) {
    await admin
      .from("property_image_provider_publications")
      .update({
        error_class: "remote_content_drift",
        last_error_message:
          "O arquivo local mudou depois do envio. O site não permite substituir imagem, então a foto publicada continua a versão anterior.",
      })
      .eq("publication_id", publicationId)
      .eq("image_id", imageId);
  }

  // Envio SEQUENCIAL: a ordem remota é a ordem de inserção.
  for (const target of plan.toSend) {
    const image = byId.get(target.id);
    if (!image) continue;
    const existing = (remoteRows ?? []).find((row) => row.image_id === image.id);
    const previousAttempts = Number(existing?.attempts ?? 0);
    const fileName = safeDeliveryFileName(image.id, {
      converted: Boolean(image.processed_storage_path),
      originalName: image.file_name,
      mimeType: image.processed_storage_path ? "image/jpeg" : image.mime_type,
    });
    const asCover = shouldSendAsCover({
      remote: snapshot,
      localIsCover: Boolean(image.is_cover),
      coversSentThisRun,
    });

    try {
      await acquireProviderSlot(admin, provider);
      const deliveryPath = image.processed_storage_path ?? image.storage_path;
      const delivery = await fetchDeliveryBytes(admin, BUCKET, deliveryPath);
      const form = new FormData();
      form.append(
        "imagem",
        new Blob([await delivery.blob.arrayBuffer()], { type: "image/jpeg" }),
        fileName,
      );
      form.append("destaque", boolToImageSimNao(asCover));

      const response = await imobiRequest(
        provider,
        `/imovel/${encodeURIComponent(externalId)}/imagem/inserir`,
        {
          method: "POST",
          formData: form,
          extraHeaders: { codigoImovel: externalId },
          correlationId,
          timeoutMs: 90_000,
          // POST de imagem NÃO é idempotente: repetir cria cópia no site.
          retryOnNetwork: false,
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
          is_cover: asCover,
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
      if (asCover) coversSentThisRun += 1;
      if (knownRemoteCount !== null) knownRemoteCount += 1;
      if (snapshot) {
        snapshot = {
          count: snapshot.count + 1,
          coverCount: snapshot.coverCount + (asCover ? 1 : 0),
          multipleCovers: snapshot.coverCount + (asCover ? 1 : 0) > 1,
        };
      }
      order.push({ imageId: image.id, position: image.position, externalImageId });
    } catch (error) {
      const normalized = toImobiError(error);
      const attempts = previousAttempts + 1;

      // Entrega AMBÍGUA (timeout/rede/5xx): o site pode ter aceitado a foto.
      // Nunca repetimos o POST às cegas — conferimos por leitura.
      if (
        isAmbiguousDeliveryError({
          category: normalized.category,
          ambiguous: normalized.ambiguous,
          status: normalized.httpStatus,
        })
      ) {
        const after = await readRemoteGallery();
        const delivered =
          after !== null && knownRemoteCount !== null && after.count >= knownRemoteCount + 1;

        if (delivered) {
          // Confirmada por contagem: nenhum POST novo para esta foto.
          await admin.from("property_image_provider_publications").upsert(
            {
              image_id: image.id,
              publication_id: publicationId,
              provider,
              content_hash: deliveredHash(image),
              is_cover: asCover,
              synced_position: image.position,
              delivery_file_name: fileName,
              status: "synced",
              error_class: "delivery_confirmed_by_count",
              last_error_message:
                "Envio sem resposta do site, confirmado pela contagem de fotos da galeria.",
              attempts: 0,
              next_retry_at: null,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "image_id,publication_id" },
          );
          sentCount += 1;
          if (asCover) coversSentThisRun += 1;
          snapshot = after;
          knownRemoteCount = after.count;
          continue;
        }

        if (after !== null && knownRemoteCount !== null) {
          // Leitura comprova que não entrou: pode tentar de novo depois.
          failedCount += 1;
          const retryAt = nextImageRetryAt("rede", attempts);
          errors.push({ imageId: image.id, message: normalized.message });
          await admin.from("property_image_provider_publications").upsert(
            {
              image_id: image.id,
              publication_id: publicationId,
              provider,
              content_hash: deliveredHash(image),
              is_cover: false,
              delivery_file_name: fileName,
              status: "error",
              last_error_message: normalized.message,
              error_class: "rede",
              attempts,
              next_retry_at: retryAt,
            },
            { onConflict: "image_id,publication_id" },
          );
          snapshot = after;
          knownRemoteCount = after.count;
          continue;
        }

        // Leitura inconclusiva: estado explícito, sem reenvio às cegas.
        unknownCount += 1;
        errors.push({ imageId: image.id, message: normalized.message });
        await admin.from("property_image_provider_publications").upsert(
          {
            image_id: image.id,
            publication_id: publicationId,
            provider,
            content_hash: deliveredHash(image),
            is_cover: false,
            delivery_file_name: fileName,
            status: "delivery_unknown",
            last_error_message: normalized.message,
            error_class: "entrega_ambigua",
            attempts,
            next_retry_at: null,
          },
          { onConflict: "image_id,publication_id" },
        );
        break;
      }

      failedCount += 1;
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
          is_cover: false,
          delivery_file_name: fileName,
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

  // Reconciliação: quantas fotos e quantos destaques o site realmente tem.
  if (params.verifyRemote !== false) {
    const after = await readRemoteGallery();
    if (after) snapshot = after;
  }
  const remoteCount: number | null = snapshot?.count ?? null;
  const multipleCovers = Boolean(snapshot?.multipleCovers);

  const syncedTotal = plan.syncedCount + sentCount;
  const extraRemote = remoteCount !== null && remoteCount > plan.expectedCount;
  const complete =
    syncedTotal === plan.expectedCount && failedCount === 0 && unknownCount === 0;
  // Nunca "sincronizado" quando o site tem foto sobrando ou mais de um destaque:
  // 2+ destaques fazem a listagem repetir o mesmo imóvel.
  const status: MediaSyncResult["status"] = inFlight
    ? "waiting_watermark"
    : multipleCovers
      ? "remote_multiple_covers"
      : unknownCount > 0
        ? "delivery_unknown"
        : complete && (extraRemote || plan.orderDrift || plan.coverDrift)
          ? "order_drift"
          : complete
            ? "synced"
            : "partial";

  // Nível de garantia REAL, sem inventar confirmação: a API só permite listar e
  // inserir, então a ordem é garantida na inserção e a paridade é conferida por
  // quantidade — não há como reposicionar, trocar destaque nem excluir foto
  // remota. Cada limitação fica registrada com o próprio nome, para a tela nunca
  // sugerir que a alteração local chegou ao site.
  const orderGuarantee = multipleCovers
    ? "remote_multiple_covers"
    : unknownCount > 0
      ? "delivery_unknown"
      : remoteCount === null
        ? "insercao_sem_verificacao"
        : extraRemote
          ? "remote_delete_unsupported"
          : plan.orderDrift
            ? "remote_order_mismatch"
            : plan.coverDrift
              ? "remote_cover_mismatch"
              : plan.contentDrift.length > 0
                ? "remote_content_drift"
              : !complete
                ? "pending"
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
    remoteCoverCount: snapshot?.coverCount ?? null,
    multipleRemoteCovers: multipleCovers,
    unknownCount,
    contentDriftCount: plan.contentDrift.length,
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

  const result = await deliverGallery(admin, {
    propertyId: job.property_id,
    provider: job.provider,
    publicationId: publication.id as string,
    externalId: publication.external_property_id as string,
    correlationId: job.correlation_id,
    galleryRevision: job.requested_revision,
  });

  // Se a galeria mudou enquanto este job rodava, agenda UM único
  // acompanhamento já na versão mais recente — nunca uma fila de versões.
  try {
    await admin.rpc("property_media_finish", {
      _property_id: job.property_id,
      _provider: job.provider,
      _processed_revision: job.requested_revision,
    });
  } catch {
    // A varredura de retry de imagens reenfileira sozinha.
  }

  return result;
}

/**
 * Enfileira sincronização de mídia para os sites em que o imóvel já está
 * publicado.
 *
 * Coalescido (19/09/2026): no máximo UM job pendente por (imóvel, site), sempre
 * na versão mais recente da galeria. Antes, cada arrastar de foto criava uma
 * versão nova e um job novo — 1374 chegou a 64 versões e 15 jobs por site, todos
 * gastando leitura do limite de 20 requisições/minuto do provedor.
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
    const { error } = await admin.rpc("queue_media_sync_coalesced", {
      _property_id: propertyId,
      _provider: provider,
      _revision: galleryRevision,
      _requested_by: options.requestedBy ?? null,
    });
    if (error) throw new Error(error.message);
  }
  return { enqueued: targets, galleryRevision };
}
