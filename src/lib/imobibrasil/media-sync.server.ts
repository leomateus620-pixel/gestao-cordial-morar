/**
 * Caminho exclusivo de MÍDIA das publicações (server-only).
 *
 * Este módulo fala apenas com os recursos de imagem do imóvel
 * (`/imagem/lista`, `/imagem/inserir`, `/imagem/excluir/{codigoImagem}`). Ele
 * NUNCA chama `/imovel/alterar`, não monta `serializeProperty` e não lê nem
 * grava vínculos de proprietário/corretor — por isso continua liberado mesmo com
 * a trava `imobi_update_sync_paused` ligada, que protege o cadastro.
 *
 * Contrato conferido em 22/09/2026 nos dois domínios: a EXCLUSÃO por código
 * existe. Com ela, ordem e capa passam a ser corrigíveis pelo caminho suportado
 * (apagar do ponto divergente para frente e reinserir na ordem correta), sempre
 * a partir dos arquivos guardados no Gestão.
 *
 * Ordem: a fonte da verdade é `property_images` ordenado por `position`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { imobiRequest } from "./client.server";
import { toImobiError } from "./errors";
import { boolToImageSimNao } from "./serializers";
import { extractInsertedImageId } from "./image-parsers";
import { deleteRemoteImage, fetchRemoteGallery, type RemoteGallery } from "./image-ops.server";
import type { ImobiProvider } from "./providers";
import { canPublishPropertyImage } from "@/lib/imoveis/image-status";
import { classifyImageDeliveryError, nextImageRetryAt } from "@/lib/imoveis/delivery";
import { fetchDeliveryBytes } from "@/lib/imoveis/delivery.server";
import { planGalleryRebuild, type RebuildRemoteItem } from "@/lib/imoveis/gallery-rebuild";
import {
  isAmbiguousDeliveryError,
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

/** Orçamento de execução: galeria grande é concluída em ciclos, sem perder progresso. */
const DEFAULT_BUDGET_MS = 110_000;

/** Tamanho máximo aceito pelo site (conferido na prática: recusa acima disso). */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  /** Exclusões confirmadas no site nesta execução. */
  deletedCount: number;
  /** Exclusões ainda pendentes neste destino. */
  pendingDeleteCount: number;
  /** Fotos reinseridas para corrigir ordem/capa nesta execução. */
  rebuiltCount: number;
  /** Reconstrução de ordem ainda pendente? */
  rebuildPending: boolean;
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
    | "remote_read_unreliable"
    | "pending_delete"
    | "rebuilding"
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
  pending_remote_delete: boolean | null;
};

type LinkRow = RemoteGalleryRow & {
  external_image_id: string | null;
  remote_url: string | null;
  desired_state: string | null;
  deleted_at: string | null;
  pending_delete_at: string | null;
};

const IMAGE_COLUMNS =
  "id, storage_path, processed_storage_path, processed_checksum, content_hash, file_name, mime_type, is_cover, position, processing_status, processing_started_at, updated_at, pending_remote_delete";

const LINK_COLUMNS =
  "image_id, content_hash, status, synced_position, is_cover, attempts, next_retry_at, external_image_id, remote_url, desired_state, deleted_at, pending_delete_at";

async function loadImages(admin: Admin, propertyId: string): Promise<ImageRow[]> {
  const { data, error } = await admin
    .from("property_images")
    .select(IMAGE_COLUMNS)
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

/** Só sobe arquivo com formato, tipo e tamanho aceitos pelo site. */
function validateDelivery(bytes: number, mime: string): string | null {
  if (!bytes) return "Arquivo vazio: a foto não pôde ser lida do armazenamento.";
  if (bytes > MAX_UPLOAD_BYTES) return "Arquivo maior do que o limite aceito pelo site (12 MB).";
  if (!ALLOWED_MIME.has(mime)) return `Tipo de arquivo não aceito pelo site (${mime}).`;
  return null;
}

/** Confere se o arquivo de entrega existe e é aceito, sem enviar nada. */
async function preflightDelivery(admin: Admin, image: ImageRow): Promise<string | null> {
  try {
    const path = image.processed_storage_path ?? image.storage_path;
    if (!path) return "sem arquivo";
    const delivery = await fetchDeliveryBytes(admin, BUCKET, path);
    const mime = image.processed_storage_path ? "image/jpeg" : (image.mime_type ?? "image/jpeg");
    return validateDelivery(delivery.blob.size, mime);
  } catch (error) {
    return error instanceof Error ? error.message : "falha ao ler o arquivo";
  }
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
    /** Renovação de reserva/checkpoint entre passos longos. */
    onProgress?: () => Promise<void>;
    budgetMs?: number;
  },
): Promise<MediaSyncResult> {
  const started = Date.now();
  const budgetMs = params.budgetMs ?? DEFAULT_BUDGET_MS;
  const outOfBudget = () => Date.now() - started > budgetMs;
  const progress = async () => {
    if (params.onProgress) await params.onProgress();
  };
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
    if (image.pending_remote_delete) return false;
    if (!["pending", "processing"].includes(String(image.processing_status))) return false;
    const since = image.processing_started_at ?? image.updated_at;
    const age = since ? now - new Date(since).getTime() : 0;
    return age < STUCK_IMAGE_WINDOW_MS;
  }).length;

  // Foto marcada para remoção sai da galeria desejada imediatamente.
  const active = all.filter((image) => !image.pending_remote_delete);
  const publishable = sortGallery(active.filter(canPublishPropertyImage).map(toLocal));
  const byId = new Map(all.map((image) => [image.id, image]));

  const { data: linkRows } = await admin
    .from("property_image_provider_publications")
    .select(LINK_COLUMNS)
    .eq("publication_id", publicationId);
  const links = (linkRows ?? []) as unknown as LinkRow[];

  const presentLinks = links.filter(
    (row) => row.desired_state !== "absent" && !row.deleted_at,
  ) as unknown as RemoteGalleryRow[];
  const plan = planGalleryDelivery(publishable, presentLinks, now);

  const errors: Array<{ imageId: string; message: string }> = [];
  const order: MediaSyncResult["order"] = [];
  let sentCount = 0;
  let failedCount = 0;
  let deletedCount = 0;
  let rebuiltCount = 0;
  let unknownCount = plan.unknown.length;
  let coversSentThisRun = 0;

  /** Leitura COMPLETA da galeria (paginada) — nunca só a primeira página. */
  let gallery: RemoteGallery = await fetchRemoteGallery(provider, externalId, correlationId);
  const snapshotOf = (g: RemoteGallery) => ({
    count: g.items.length,
    coverCount: g.items.filter((item) => item.destaque).length,
  });

  // ---------------------------------------------------------------- exclusões
  // Registradas antes de qualquer remoção local. O vínculo permanece até a
  // confirmação por leitura em CADA destino: falha num site deixa pendente só
  // aquele site.
  const toDelete = links.filter(
    (row) => row.desired_state === "absent" && !row.deleted_at && row.external_image_id,
  );
  // Sem código remoto não há como excluir por ID: registra o impedimento.
  const deleteWithoutCode = links.filter(
    (row) => row.desired_state === "absent" && !row.deleted_at && !row.external_image_id,
  );
  for (const row of deleteWithoutCode) {
    const match = gallery.reliable
      ? gallery.items.find((item) => item.url && item.url === row.remote_url)
      : undefined;
    if (match?.codigoImagem) {
      row.external_image_id = match.codigoImagem;
      await admin
        .from("property_image_provider_publications")
        .update({ external_image_id: match.codigoImagem })
        .eq("publication_id", publicationId)
        .eq("image_id", row.image_id);
      toDelete.push(row);
    }
  }

  for (const row of toDelete) {
    if (outOfBudget()) break;
    await progress();
    const result = await deleteRemoteImage(
      provider,
      externalId,
      row.external_image_id as string,
      correlationId,
    );
    if (result.confirmed) {
      deletedCount += 1;
      await admin
        .from("property_image_provider_publications")
        .update({
          status: "deleted",
          deleted_at: new Date().toISOString(),
          last_op: "delete",
          last_op_state: result.alreadyAbsent ? "already_absent" : "confirmed",
          last_error_message: null,
          error_class: null,
        })
        .eq("publication_id", publicationId)
        .eq("image_id", row.image_id);
    } else {
      await admin
        .from("property_image_provider_publications")
        .update({
          last_op: "delete",
          last_op_state: "pending",
          error_class: "exclusao_pendente",
          last_error_message: result.message ?? "Exclusão não confirmada pelo site.",
          attempts: Number(row.attempts ?? 0) + 1,
          next_retry_at: nextImageRetryAt("rede", Number(row.attempts ?? 0) + 1),
        })
        .eq("publication_id", publicationId)
        .eq("image_id", row.image_id);
    }
    gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  }

  // Foto local removida em TODOS os destinos: agora sim o registro e os arquivos
  // podem sair (antes disso, apagar impediria a recuperação).
  await purgeFullyDeletedImages(admin, propertyId);

  // -------------------------------------------------------------- inserções
  const remoteCoverCountBefore = snapshotOf(gallery).coverCount;
  for (const target of plan.toSend) {
    if (outOfBudget()) break;
    const image = byId.get(target.id);
    if (!image) continue;
    await progress();
    const existing = links.find((row) => row.image_id === image.id);
    const previousAttempts = Number(existing?.attempts ?? 0);
    const fileName = safeDeliveryFileName(image.id, {
      converted: Boolean(image.processed_storage_path),
      originalName: image.file_name,
      mimeType: image.processed_storage_path ? "image/jpeg" : image.mime_type,
    });
    // Capa: só um destaque pode existir. Destaque=Sim apenas quando está
    // comprovado que o site não tem nenhum e esta é a primeira foto desejada.
    const asCover =
      gallery.reliable &&
      remoteCoverCountBefore === 0 &&
      coversSentThisRun === 0 &&
      publishable[0]?.id === image.id;

    try {
      const deliveryPath = image.processed_storage_path ?? image.storage_path;
      const delivery = await fetchDeliveryBytes(admin, BUCKET, deliveryPath);
      const buffer = await delivery.blob.arrayBuffer();
      const mime = image.processed_storage_path ? "image/jpeg" : (image.mime_type ?? "image/jpeg");
      const invalid = validateDelivery(buffer.byteLength, mime);
      if (invalid) throw new Error(invalid);

      const form = new FormData();
      form.append("imagem", new Blob([buffer], { type: mime }), fileName);
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

      // Código da FOTO: só chave de imagem é aceita (o leitor genérico de imóvel
      // devolveria o código do imóvel). Sem código, a reconciliação por leitura
      // preenche depois.
      const externalImageId = extractInsertedImageId(response.data);
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
          desired_state: "present",
          status: "synced",
          last_op: "insert",
          last_op_state: externalImageId ? "confirmed" : "awaiting_code",
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
      order.push({ imageId: image.id, position: image.position, externalImageId });
    } catch (error) {
      const normalized = toImobiError(error);
      const attempts = previousAttempts + 1;

      // Entrega AMBÍGUA (timeout/rede/5xx): o site pode ter aceitado a foto.
      // Nunca repetimos o POST às cegas — conferimos por leitura e por
      // IDENTIDADE (código novo na galeria), não só por contagem.
      if (
        isAmbiguousDeliveryError({
          category: normalized.category,
          ambiguous: normalized.ambiguous,
          status: normalized.httpStatus,
        })
      ) {
        const before = new Set(
          gallery.items.map((item) => item.codigoImagem ?? item.url ?? "").filter(Boolean),
        );
        const after = await fetchRemoteGallery(provider, externalId, correlationId);
        const appeared = after.reliable
          ? after.items.filter(
              (item) => !before.has(item.codigoImagem ?? item.url ?? ""),
            )
          : [];

        if (after.reliable && appeared.length === 1) {
          // Entrega confirmada por identidade: a foto nova está identificada.
          const arrived = appeared[0]!;
          await admin.from("property_image_provider_publications").upsert(
            {
              image_id: image.id,
              publication_id: publicationId,
              provider,
              external_image_id: arrived.codigoImagem,
              remote_url: arrived.url,
              content_hash: deliveredHash(image),
              is_cover: arrived.destaque,
              synced_position: image.position,
              delivery_file_name: fileName,
              desired_state: "present",
              status: "synced",
              last_op: "insert",
              last_op_state: "confirmed_by_read",
              error_class: null,
              last_error_message:
                "Envio sem resposta do site, confirmado pela leitura da galeria.",
              attempts: 0,
              next_retry_at: null,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "image_id,publication_id" },
          );
          sentCount += 1;
          if (arrived.destaque) coversSentThisRun += 1;
          gallery = after;
          continue;
        }

        if (after.reliable && appeared.length === 0) {
          // Leitura confiável comprova que não entrou: pode tentar de novo.
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
              desired_state: "present",
              status: "error",
              last_op: "insert",
              last_op_state: "not_delivered",
              last_error_message: normalized.message,
              error_class: "rede",
              attempts,
              next_retry_at: retryAt,
            },
            { onConflict: "image_id,publication_id" },
          );
          gallery = after;
          continue;
        }

        // Inconclusivo: estado explícito, sem reenvio às cegas.
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
            desired_state: "present",
            status: "delivery_unknown",
            last_op: "insert",
            last_op_state: "unknown",
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
          desired_state: "present",
          status: "error",
          last_op: "insert",
          last_op_state: "failed",
          last_error_message: normalized.message,
          error_class: errorClass,
          attempts,
          next_retry_at: retryAt,
        },
        { onConflict: "image_id,publication_id" },
      );
      if (isRateLimitError(normalized.message)) break;
    }
  }

  // Releitura e reconciliação por código/endereço.
  if (params.verifyRemote !== false || sentCount > 0) {
    gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  }
  await reconcileLinkCodes(admin, publicationId, publishable, gallery);

  // ------------------------------------------------------- ordem e capa
  const rebuild = await rebuildRemoteOrder(admin, {
    propertyId,
    provider,
    publicationId,
    externalId,
    correlationId,
    desiredImageIds: publishable.map((image) => image.id),
    gallery,
    byId,
    outOfBudget,
    progress,
  });
  rebuiltCount = rebuild.reinserted;
  deletedCount += rebuild.deleted;
  if (rebuild.gallery) gallery = rebuild.gallery;

  const snapshot = snapshotOf(gallery);
  const remoteCount = gallery.reliable ? snapshot.count : null;
  const multipleCovers = gallery.reliable && snapshot.coverCount > 1;

  const { data: afterLinks } = await admin
    .from("property_image_provider_publications")
    .select(LINK_COLUMNS)
    .eq("publication_id", publicationId);
  const finalLinks = (afterLinks ?? []) as unknown as LinkRow[];
  const pendingDeleteCount = finalLinks.filter(
    (row) => row.desired_state === "absent" && !row.deleted_at,
  ).length;
  const syncedTotal = finalLinks.filter(
    (row) => row.desired_state !== "absent" && row.status === "synced",
  ).length;

  const extraRemote = remoteCount !== null && remoteCount > plan.expectedCount;
  const rebuildPending = rebuild.pending;
  const complete =
    syncedTotal === plan.expectedCount &&
    failedCount === 0 &&
    unknownCount === 0 &&
    pendingDeleteCount === 0 &&
    !rebuildPending &&
    gallery.reliable &&
    !multipleCovers &&
    !extraRemote;

  const status: MediaSyncResult["status"] = inFlight
    ? "waiting_watermark"
    : pendingDeleteCount > 0
      ? "pending_delete"
      : !gallery.reliable
        ? "remote_read_unreliable"
        : multipleCovers
          ? "remote_multiple_covers"
          : unknownCount > 0
            ? "delivery_unknown"
            : rebuildPending
              ? "rebuilding"
              : complete
                ? "synced"
                : extraRemote
                  ? "order_drift"
                  : "partial";

  const orderGuarantee = !gallery.reliable
    ? gallery.reason ?? "leitura_inconclusiva"
    : multipleCovers
      ? "remote_multiple_covers"
      : unknownCount > 0
        ? "delivery_unknown"
        : pendingDeleteCount > 0
          ? "exclusao_pendente"
          : rebuildPending
            ? rebuild.reason ?? "ordem_em_reconstrucao"
            : extraRemote
              ? "fotos_antigas_sobrando"
              : plan.contentDrift.length > 0
                ? "remote_content_drift"
                : !complete
                  ? "pending"
                  : "ordem_confirmada_por_leitura";

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
      media_rebuild_state: rebuild.checkpoint,
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
    remoteCoverCount: gallery.reliable ? snapshot.coverCount : null,
    multipleRemoteCovers: multipleCovers,
    unknownCount,
    contentDriftCount: plan.contentDrift.length,
    deletedCount,
    pendingDeleteCount,
    rebuiltCount,
    rebuildPending,
    orderGuarantee,
    orderDrift: plan.orderDrift,
    coverDrift: plan.coverDrift,
    status,
    durationMs: Date.now() - started,
    order: publishable.map((image) => ({ imageId: image.id, position: image.position })),
    errors,
  };

  console.info(
    "[media_sync]",
    JSON.stringify({ ...result, order: order.length ? order : undefined }),
  );
  return result;
}

/**
 * Casa vínculo local ↔ `codigoImagem` do site. Quando o código chegou vazio na
 * inserção, o endereço da foto e a ordem de inserção resolvem — sem isso não há
 * como excluir nem reordenar depois.
 */
async function reconcileLinkCodes(
  admin: Admin,
  publicationId: string,
  desired: readonly LocalGalleryImage[],
  gallery: RemoteGallery,
): Promise<void> {
  if (!gallery.reliable) return;
  const { data } = await admin
    .from("property_image_provider_publications")
    .select("image_id, external_image_id, remote_url, status, desired_state")
    .eq("publication_id", publicationId);
  const rows = (data ?? []) as Array<{
    image_id: string;
    external_image_id: string | null;
    remote_url: string | null;
    status: string | null;
    desired_state: string | null;
  }>;

  const taken = new Set(
    rows.map((row) => row.external_image_id).filter((id): id is string => Boolean(id)),
  );
  const free = gallery.items.filter(
    (item) => item.codigoImagem && !taken.has(item.codigoImagem),
  );
  if (!free.length) return;

  // Ordem remota = ordem de inserção: as fotos sem código recebem os códigos
  // livres na mesma sequência em que foram enviadas.
  const pending = desired
    .map((image) => rows.find((row) => row.image_id === image.id))
    .filter(
      (row): row is (typeof rows)[number] =>
        Boolean(row) && row!.status === "synced" && !row!.external_image_id,
    );

  for (let index = 0; index < pending.length && index < free.length; index += 1) {
    const row = pending[index]!;
    const item = free[index]!;
    await admin
      .from("property_image_provider_publications")
      .update({
        external_image_id: item.codigoImagem,
        remote_url: item.url,
        is_cover: item.destaque,
        verified_at: new Date().toISOString(),
        verification: { matched_by: "ordem_de_insercao" },
        last_op_state: "confirmed_by_read",
      })
      .eq("publication_id", publicationId)
      .eq("image_id", row.image_id);
  }
}

/**
 * Corrige ordem e capa pelo único caminho suportado: excluir do primeiro ponto
 * divergente para frente e reinserir na ordem correta, com checkpoint para
 * retomar de onde parou.
 */
async function rebuildRemoteOrder(
  admin: Admin,
  params: {
    propertyId: string;
    provider: ImobiProvider;
    publicationId: string;
    externalId: string;
    correlationId: string;
    desiredImageIds: string[];
    gallery: RemoteGallery;
    byId: Map<string, ImageRow>;
    outOfBudget: () => boolean;
    progress: () => Promise<void>;
  },
): Promise<{
  deleted: number;
  reinserted: number;
  pending: boolean;
  reason: string | null;
  checkpoint: Record<string, unknown> | null;
  gallery: RemoteGallery | null;
}> {
  const { provider, publicationId, externalId, correlationId, desiredImageIds } = params;
  let gallery = params.gallery;
  if (!gallery.reliable) {
    return { deleted: 0, reinserted: 0, pending: false, reason: null, checkpoint: null, gallery: null };
  }

  const { data } = await admin
    .from("property_image_provider_publications")
    .select("image_id, external_image_id, status, desired_state")
    .eq("publication_id", publicationId);
  const rows = (data ?? []) as Array<{
    image_id: string;
    external_image_id: string | null;
    status: string | null;
    desired_state: string | null;
  }>;
  const imageIdByCode = new Map(
    rows
      .filter((row) => row.external_image_id && row.desired_state !== "absent")
      .map((row) => [row.external_image_id as string, row.image_id]),
  );

  const remote: RebuildRemoteItem[] = gallery.items.map((item) => ({
    codigoImagem: item.codigoImagem,
    imageId: item.codigoImagem ? (imageIdByCode.get(item.codigoImagem) ?? null) : null,
    destaque: item.destaque,
  }));

  const plan = planGalleryRebuild({ desiredImageIds, remote });
  if (!plan.needed) {
    await admin
      .from("property_provider_publications")
      .update({ media_rebuild_state: null })
      .eq("id", publicationId);
    return { deleted: 0, reinserted: 0, pending: false, reason: null, checkpoint: null, gallery };
  }
  if (!plan.feasible) {
    return {
      deleted: 0,
      reinserted: 0,
      pending: true,
      reason: plan.reason,
      checkpoint: { state: "blocked", reason: plan.reason, at: new Date().toISOString() },
      gallery,
    };
  }

  let deleted = 0;
  let reinserted = 0;

  // 0) Antes de QUALQUER exclusão: todos os arquivos que serão reinseridos
  //    precisam existir e ser válidos. Sem isso, apagar deixaria a galeria menor.
  //    (Só na primeira fase; em retomada a exclusão já aconteceu.)
  if (plan.deleteRemoteIds.length) {
    for (const imageId of plan.reinsertImageIds) {
      const image = params.byId.get(imageId);
      const problem = image ? await preflightDelivery(admin, image) : "foto local ausente";
      if (problem) {
        return {
          deleted: 0,
          reinserted: 0,
          pending: true,
          reason: "arquivo_indisponivel",
          checkpoint: {
            state: "blocked",
            reason: `arquivo_indisponivel: ${imageId} (${problem})`,
            at: new Date().toISOString(),
          },
          gallery,
        };
      }
    }
  }

  // 1) Remove a cauda divergente (uma por uma, conferindo por leitura).
  for (const code of plan.deleteRemoteIds) {
    if (params.outOfBudget()) {
      return {
        deleted,
        reinserted,
        pending: true,
        reason: "ordem_em_reconstrucao",
        checkpoint: {
          state: "deleting",
          keptPrefix: plan.keptPrefix,
          remaining: plan.deleteRemoteIds.length - deleted,
          at: new Date().toISOString(),
        },
        gallery,
      };
    }
    await params.progress();
    const result = await deleteRemoteImage(provider, externalId, code, correlationId);
    if (!result.confirmed) {
      return {
        deleted,
        reinserted,
        pending: true,
        reason: "exclusao_nao_confirmada",
        checkpoint: { state: "deleting", at: new Date().toISOString() },
        gallery,
      };
    }
    deleted += 1;
    const imageId = imageIdByCode.get(code);
    if (imageId) {
      // O vínculo volta a "não enviada": a foto será reinserida na ordem certa.
      await admin
        .from("property_image_provider_publications")
        .update({
          status: "pending",
          external_image_id: null,
          remote_url: null,
          is_cover: false,
          synced_position: null,
          last_op: "rebuild_delete",
          last_op_state: "confirmed",
          attempts: 0,
          next_retry_at: null,
        })
        .eq("publication_id", publicationId)
        .eq("image_id", imageId);
    }
  }
  gallery = await fetchRemoteGallery(provider, externalId, correlationId);

  // 2) Reinsere na ordem correta. O primeiro item vai como destaque somente
  //    quando o site ficou sem nenhum destaque.
  let coverCount = gallery.items.filter((item) => item.destaque).length;
  for (const imageId of plan.reinsertImageIds) {
    if (params.outOfBudget()) {
      return {
        deleted,
        reinserted,
        pending: true,
        reason: "ordem_em_reconstrucao",
        checkpoint: {
          state: "reinserting",
          remaining: plan.reinsertImageIds.length - reinserted,
          at: new Date().toISOString(),
        },
        gallery,
      };
    }
    const image = params.byId.get(imageId);
    if (!image) continue;
    await params.progress();

    const fileName = safeDeliveryFileName(image.id, {
      converted: Boolean(image.processed_storage_path),
      originalName: image.file_name,
      mimeType: image.processed_storage_path ? "image/jpeg" : image.mime_type,
    });
    const asCover = coverCount === 0 && desiredImageIds[0] === imageId;
    try {
      const deliveryPath = image.processed_storage_path ?? image.storage_path;
      const delivery = await fetchDeliveryBytes(admin, BUCKET, deliveryPath);
      const buffer = await delivery.blob.arrayBuffer();
      const mime = image.processed_storage_path ? "image/jpeg" : (image.mime_type ?? "image/jpeg");
      const invalid = validateDelivery(buffer.byteLength, mime);
      if (invalid) throw new Error(invalid);
      const form = new FormData();
      form.append("imagem", new Blob([buffer], { type: mime }), fileName);
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
          retryOnNetwork: false,
        },
      );
      const externalImageId = extractInsertedImageId(response.data);
      await admin.from("property_image_provider_publications").upsert(
        {
          image_id: image.id,
          publication_id: publicationId,
          provider,
          external_image_id: externalImageId,
          content_hash: image.processed_checksum ?? image.content_hash ?? null,
          is_cover: asCover,
          synced_position: image.position,
          delivery_file_name: fileName,
          desired_state: "present",
          status: "synced",
          last_op: "rebuild_insert",
          last_op_state: externalImageId ? "confirmed" : "awaiting_code",
          last_error_message: null,
          error_class: null,
          attempts: 0,
          next_retry_at: null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "image_id,publication_id" },
      );
      reinserted += 1;
      if (asCover) coverCount += 1;
    } catch (error) {
      const normalized = toImobiError(error);
      return {
        deleted,
        reinserted,
        pending: true,
        reason: "reinsercao_interrompida",
        checkpoint: {
          state: "reinserting",
          remaining: plan.reinsertImageIds.length - reinserted,
          error: normalized.message,
          at: new Date().toISOString(),
        },
        gallery,
      };
    }
  }

  gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  await reconcileLinkCodes(
    admin,
    publicationId,
    desiredImageIds.map((id) => ({
      id,
      position: 0,
      isCover: false,
      deliveredHash: null,
    })),
    gallery,
  );
  return { deleted, reinserted, pending: false, reason: null, checkpoint: null, gallery };
}

/**
 * Apaga registro e arquivos SOMENTE de fotos cuja remoção já foi confirmada em
 * todos os destinos. Enquanto houver destino pendente, tudo é preservado para
 * permitir a recuperação.
 */
export async function purgeFullyDeletedImages(admin: Admin, propertyId: string): Promise<number> {
  const { data: pendingImages } = await admin
    .from("property_images")
    .select(
      "id, storage_path, original_storage_path, processed_storage_path, thumbnail_storage_path",
    )
    .eq("property_id", propertyId)
    .eq("pending_remote_delete", true);
  const rows = (pendingImages ?? []) as Array<Record<string, string | null>>;
  if (!rows.length) return 0;

  let purged = 0;
  for (const row of rows) {
    const imageId = row["id"] as string;
    const { data: links } = await admin
      .from("property_image_provider_publications")
      .select("id, desired_state, deleted_at")
      .eq("image_id", imageId);
    const stillPending = (links ?? []).some(
      (link) => (link as { desired_state?: string; deleted_at?: string }).deleted_at === null,
    );
    if (stillPending) continue;

    const paths = [
      row["storage_path"],
      row["original_storage_path"],
      row["processed_storage_path"],
      row["thumbnail_storage_path"],
    ].filter((path, index, all): path is string => Boolean(path) && all.indexOf(path) === index);

    const { error } = await admin.from("property_images").delete().eq("id", imageId);
    if (error) continue;
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    purged += 1;
  }
  if (purged) await admin.rpc("property_images_normalize", { _property_id: propertyId });
  return purged;
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
  options: { onProgress?: () => Promise<void> } = {},
): Promise<MediaSyncResult | { status: "not_published" }> {
  const { data: publication } = await admin
    .from("property_provider_publications")
    .select("id, external_property_id, enabled, status")
    .eq("property_id", job.property_id)
    .eq("provider", job.provider)
    .maybeSingle();

  if (!publication?.external_property_id || publication.enabled === false) {
    // Foto NUNCA cria imóvel no site. Se o vínculo existe mas o código remoto
    // está ausente, pedimos reconciliação (somente leitura por referência).
    if (publication && publication.enabled !== false) {
      await admin.from("property_sync_jobs").upsert(
        {
          property_id: job.property_id,
          provider: job.provider,
          action: "reconcile",
          requested_revision: job.requested_revision,
          status: "pending",
          next_run_at: new Date().toISOString(),
        },
        { onConflict: "property_id,provider,action,requested_revision" },
      );
      return { status: "not_published" };
    }
    return { status: "not_published" };
  }

  // O agendamento do acompanhamento acontece junto do encerramento do job
  // (`property_media_finish_job`), para que uma alteração feita DURANTE o envio
  // gere processamento efetivo em vez de ficar apenas marcada.
  return deliverGallery(admin, {
    propertyId: job.property_id,
    provider: job.provider,
    publicationId: publication.id as string,
    externalId: publication.external_property_id as string,
    correlationId: job.correlation_id,
    galleryRevision: job.requested_revision,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });
}

/**
 * Enfileira sincronização de mídia para os sites em que o imóvel já está
 * publicado.
 *
 * Coalescido (19/09/2026): no máximo UM job pendente por (imóvel, site), sempre
 * na versão mais recente da galeria.
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
