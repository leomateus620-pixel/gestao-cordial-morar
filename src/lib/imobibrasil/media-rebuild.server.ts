/** Durable, bounded reconstruction of an ImobiBrasil gallery. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImobiProvider } from "./providers";
import type { RemoteGallery } from "./image-ops.server";
import { deleteRemoteImage, fetchRemoteGallery } from "./image-ops.server";
import { extractInsertedImageId } from "./image-parsers";
import { imobiRequest } from "./client.server";
import { boolToImageSimNao } from "./serializers";
import { fetchDeliveryBytes } from "@/lib/imoveis/delivery.server";
import { planGalleryRebuild, type RebuildRemoteItem } from "@/lib/imoveis/gallery-rebuild";
import { safeDeliveryFileName } from "@/lib/imoveis/gallery-plan";

type Admin = SupabaseClient;
type Image = {
  id: string;
  storage_path: string;
  processed_storage_path: string | null;
  processed_checksum: string | null;
  content_hash: string | null;
  file_name: string;
  mime_type: string | null;
  position: number;
};

type Operation =
  | { kind: "delete"; code: string; imageId: string | null }
  | { kind: "insert"; imageId: string; beforeCodes: string[]; externalImageId?: string | null };

type Checkpoint = {
  revision: number;
  phase: "deleting" | "reinserting";
  deleteRemoteIds: string[];
  reinsertImageIds: string[];
  deleteIndex: number;
  insertIndex: number;
  keptPrefix: number;
  operation?: Operation;
};

type Params = {
  propertyId: string;
  provider: ImobiProvider;
  publicationId: string;
  externalId: string;
  correlationId: string;
  jobId: string;
  leaseToken: string;
  galleryRevision: number;
  desiredImageIds: string[];
  contentDrift: string[];
  gallery: RemoteGallery;
  byId: Map<string, Image>;
  remainingMs: () => number;
  progress: () => Promise<void>;
};

type Result = {
  deleted: number;
  reinserted: number;
  pending: boolean;
  reason: string | null;
  checkpoint: Checkpoint | Record<string, unknown> | null;
  gallery: RemoteGallery | null;
};

async function persistCheckpoint(admin: Admin, params: Params, checkpoint: Checkpoint | null): Promise<void> {
  const { data, error } = await admin.rpc("property_publication_update_if_owned" as never, {
    _job_id: params.jobId, _lease_token: params.leaseToken,
    _publication_id: params.publicationId,
    _fields: { media_rebuild_state: checkpoint },
  } as never);
  if (error || data !== true)
    throw new Error(`media_checkpoint_persist_failed: ${error?.message ?? "lease lost"}`);
}

async function persistLink(admin: Admin, params: Params, row: Record<string, unknown>): Promise<void> {
  const { data, error } = await admin.rpc("property_media_link_write_if_owned" as never, {
    _job_id: params.jobId, _lease_token: params.leaseToken,
    _publication_id: params.publicationId, _image_id: row.image_id,
    _fields: row,
  } as never);
  if (error || data !== true)
    throw new Error(`media_link_persist_failed: ${error?.message ?? "lease lost"}`);
}

async function source(admin: Admin, image: Image): Promise<{ bytes: ArrayBuffer; mime: string; fileName: string }> {
  const path = image.processed_storage_path ?? image.storage_path;
  if (!path) throw new Error(`arquivo_indisponivel: ${image.id}`);
  const delivered = await fetchDeliveryBytes(admin, "property-images", path);
  const bytes = await delivered.blob.arrayBuffer();
  const mime = image.processed_storage_path ? "image/jpeg" : (image.mime_type ?? "image/jpeg");
  if (!bytes.byteLength || bytes.byteLength > 12 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error(`arquivo_invalido: ${image.id}`);
  return {
    bytes, mime,
    fileName: safeDeliveryFileName(image.id, {
      converted: Boolean(image.processed_storage_path), originalName: image.file_name, mimeType: mime,
    }),
  };
}

async function confirmInsert(admin: Admin, params: Params, checkpoint: Checkpoint, gallery: RemoteGallery): Promise<boolean> {
  const op = checkpoint.operation;
  if (!op || op.kind !== "insert") return false;
  if (!op.externalImageId || !gallery.reliable) return false;
  const item = gallery.items.find((row) => row.codigoImagem === op.externalImageId);
  if (!item) return false;
  const image = params.byId.get(op.imageId);
  if (!image) return false;
  await params.progress();
  await persistLink(admin, params, {
    image_id: image.id, publication_id: params.publicationId, provider: params.provider,
    external_image_id: op.externalImageId, remote_url: item.url,
    content_hash: image.processed_checksum ?? image.content_hash,
    is_cover: item.destaque, synced_position: image.position,
    desired_state: "present", status: "synced", last_op: "rebuild_insert",
    last_op_state: "confirmed_by_read", error_class: null, last_error_message: null,
    attempts: 0, next_retry_at: null, synced_at: new Date().toISOString(),
    verification: { matched_by: "codigo_retornado_pela_operacao" },
  });
  checkpoint.insertIndex += 1;
  delete checkpoint.operation;
  await persistCheckpoint(admin, params, checkpoint);
  return true;
}

/** Each external effect has a committed intent before the call. A lost response never becomes a blind retry. */
export async function rebuildRemoteOrderDurable(admin: Admin, params: Params): Promise<Result> {
  let gallery = params.gallery;
  if (!gallery.reliable) return { deleted: 0, reinserted: 0, pending: true, reason: gallery.reason, checkpoint: null, gallery };

  const { data: publication, error: publicationError } = await admin.from("property_provider_publications")
    .select("media_rebuild_state").eq("id", params.publicationId).single();
  if (publicationError) throw new Error(publicationError.message);
  const { data: links, error: linksError } = await admin.from("property_image_provider_publications")
    .select("image_id, external_image_id, desired_state, status").eq("publication_id", params.publicationId);
  if (linksError) throw new Error(linksError.message);
  const linkRows = links ?? [];
  const codeToImage = new Map(linkRows.filter((row) => row.external_image_id && row.desired_state !== "absent")
    .map((row) => [row.external_image_id as string, row.image_id as string]));
  let checkpoint = publication.media_rebuild_state as Checkpoint | null;
  const validCheckpoint = checkpoint && Array.isArray(checkpoint.deleteRemoteIds) && Array.isArray(checkpoint.reinsertImageIds);
  if (!validCheckpoint) checkpoint = null;

  // A prior POST whose response was lost cannot be identified from gallery
  // count, order, URL, or a single unmatched photo. Preserve the exception.
  if (checkpoint?.operation?.kind === "insert") {
    if (await confirmInsert(admin, params, checkpoint, gallery)) {
      // Continue from a confirmed code.
    } else {
      const op = checkpoint.operation;
      await persistLink(admin, params, {
        image_id: op.imageId, publication_id: params.publicationId, provider: params.provider,
        desired_state: "present", status: "delivery_unknown", last_op: "rebuild_insert",
        last_op_state: "delivery_unknown", error_class: "entrega_ambigua",
        last_error_message: "Envio sem código de imagem confirmado; requer evidência do provedor.",
        next_retry_at: null,
      });
      return { deleted: 0, reinserted: 0, pending: true, reason: "delivery_unknown", checkpoint, gallery };
    }
  }

  if (checkpoint && checkpoint.revision !== params.galleryRevision && !checkpoint.operation) {
    checkpoint = null;
    await persistCheckpoint(admin, params, null);
  }
  if (!checkpoint) {
    const remote: RebuildRemoteItem[] = gallery.items.map((item) => ({
      codigoImagem: item.codigoImagem,
      imageId: item.codigoImagem ? codeToImage.get(item.codigoImagem) ?? null : null,
      destaque: item.destaque,
    }));
    const desiredDrift = params.desiredImageIds.find((id) => params.contentDrift.includes(id)) ?? null;
    const plan = planGalleryRebuild({
      desiredImageIds: params.desiredImageIds, remote, rebuildFromImageId: desiredDrift,
    });
    if (!plan.needed) return { deleted: 0, reinserted: 0, pending: false, reason: null, checkpoint: null, gallery };
    if (!plan.feasible) return {
      deleted: 0, reinserted: 0, pending: true, reason: plan.reason,
      checkpoint: { state: "blocked", reason: plan.reason }, gallery,
    };
    // Validate ALL originals/derivatives before deleting the first remote photo.
    for (const imageId of plan.reinsertImageIds) {
      const image = params.byId.get(imageId);
      if (!image) return { deleted: 0, reinserted: 0, pending: true, reason: "arquivo_indisponivel", checkpoint: null, gallery };
      try { await source(admin, image); } catch (error) {
        return { deleted: 0, reinserted: 0, pending: true, reason: error instanceof Error ? error.message : "arquivo_indisponivel", checkpoint: null, gallery };
      }
    }
    checkpoint = {
      revision: params.galleryRevision, phase: "deleting", deleteRemoteIds: plan.deleteRemoteIds,
      reinsertImageIds: plan.reinsertImageIds, deleteIndex: 0, insertIndex: 0, keptPrefix: plan.keptPrefix,
    };
    await params.progress();
    await persistCheckpoint(admin, params, checkpoint);
  }

  let deleted = 0;
  let reinserted = 0;
  while (checkpoint.phase === "deleting" && checkpoint.deleteIndex < checkpoint.deleteRemoteIds.length) {
    if (params.remainingMs() < 20_000) return { deleted, reinserted, pending: true, reason: "continuacao_agendada", checkpoint, gallery };
    const code = checkpoint.deleteRemoteIds[checkpoint.deleteIndex]!;
    const imageId = codeToImage.get(code) ?? null;
    await params.progress();
    if (!checkpoint.operation) {
      checkpoint.operation = { kind: "delete", code, imageId };
      await persistCheckpoint(admin, params, checkpoint);
    }
    if (!gallery.reliable) return { deleted, reinserted, pending: true, reason: "leitura_inconclusiva", checkpoint, gallery };
    if (gallery.items.some((item) => item.codigoImagem === code)) {
      const result = await deleteRemoteImage(params.provider, params.externalId, code, params.correlationId);
      if (!result.confirmed) return { deleted, reinserted, pending: true, reason: "exclusao_nao_confirmada", checkpoint, gallery };
    }
    gallery = await fetchRemoteGallery(params.provider, params.externalId, params.correlationId);
    if (!gallery.reliable || gallery.items.some((item) => item.codigoImagem === code))
      return { deleted, reinserted, pending: true, reason: "exclusao_nao_confirmada", checkpoint, gallery };
    await params.progress();
    if (imageId) await persistLink(admin, params, {
      image_id: imageId, publication_id: params.publicationId, provider: params.provider,
      desired_state: "present", status: "pending", external_image_id: null, remote_url: null,
      is_cover: false, synced_position: null, last_op: "rebuild_delete", last_op_state: "confirmed",
      attempts: 0, next_retry_at: null,
    });
    checkpoint.deleteIndex += 1;
    delete checkpoint.operation;
    await persistCheckpoint(admin, params, checkpoint);
    deleted += 1;
  }
  checkpoint.phase = "reinserting";
  await persistCheckpoint(admin, params, checkpoint);

  while (checkpoint.insertIndex < checkpoint.reinsertImageIds.length) {
    if (params.remainingMs() < 95_000) return { deleted, reinserted, pending: true, reason: "continuacao_agendada", checkpoint, gallery };
    const imageId = checkpoint.reinsertImageIds[checkpoint.insertIndex]!;
    const image = params.byId.get(imageId);
    if (!image) return { deleted, reinserted, pending: true, reason: "arquivo_indisponivel", checkpoint, gallery };
    if (!gallery.reliable) return { deleted, reinserted, pending: true, reason: "leitura_inconclusiva", checkpoint, gallery };
    await params.progress();
    const prepared = await source(admin, image);
    const asCover = checkpoint.insertIndex === 0 && checkpoint.keptPrefix === 0 && gallery.items.every((item) => !item.destaque);
    const form = new FormData();
    form.append("imagem", new Blob([prepared.bytes], { type: prepared.mime }), prepared.fileName);
    form.append("destaque", boolToImageSimNao(asCover));
    checkpoint.operation = { kind: "insert", imageId, beforeCodes: gallery.items.map((item) => item.codigoImagem).filter((id): id is string => Boolean(id)) };
    await persistCheckpoint(admin, params, checkpoint);
    await persistLink(admin, params, {
      image_id: imageId, publication_id: params.publicationId, provider: params.provider,
      desired_state: "present", status: "delivery_unknown", last_op: "rebuild_insert",
      last_op_state: "intent_persisted", content_hash: image.processed_checksum ?? image.content_hash,
      delivery_file_name: prepared.fileName,
    });
    try {
      const response = await imobiRequest(params.provider,
        `/imovel/${encodeURIComponent(params.externalId)}/imagem/inserir`, {
          method: "POST", formData: form, extraHeaders: { codigoImovel: params.externalId },
          correlationId: params.correlationId, timeoutMs: 90_000, retryOnNetwork: false,
        });
      const code = extractInsertedImageId(response.data);
      if (code) {
        checkpoint.operation.externalImageId = code;
        await params.progress();
        await persistCheckpoint(admin, params, checkpoint);
      }
    } catch (error) {
      // The POST may have been accepted. Keep the pre-call checkpoint and stop.
      return { deleted, reinserted, pending: true, reason: "delivery_unknown", checkpoint, gallery };
    }
    gallery = await fetchRemoteGallery(params.provider, params.externalId, params.correlationId);
    if (!(await confirmInsert(admin, params, checkpoint, gallery)))
      return { deleted, reinserted, pending: true, reason: "delivery_unknown", checkpoint, gallery };
    reinserted += 1;
  }

  await params.progress();
  await persistCheckpoint(admin, params, null);
  return { deleted, reinserted, pending: false, reason: null, checkpoint: null, gallery };
}
