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
import { deletionAllowed, displayOrder, MAX_DELETES_PER_RUN } from "@/lib/imoveis/gallery-display";

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
  /** Enviar primeiro, apagar depois (12/10/2026). Checkpoints antigos são convertidos. */
  insertFirst?: boolean;
  /** Capa antiga a retirar ANTES de enviar a nova (o site só aceita uma capa). */
  coverCode?: string | null;
  coverDone?: boolean;
  /** Fotos no site quando a reconstrução começou (disjuntor de 80%). */
  startCount?: number;
  /** Fotos reenviadas por ausência comprovada (no máximo uma vez cada). */
  absentRetried?: string[];
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
  /**
   * Estado a gravar. `undefined` = esta rodada não tem conhecimento confiável
   * do checkpoint (leitura não confiável): o valor gravado é preservado.
   */
  checkpoint: Checkpoint | Record<string, unknown> | null | undefined;
  /** completed = terminou; abandoned = descartado de propósito; paused = retoma depois. */
  outcome: "completed" | "abandoned" | "paused";
  gallery: RemoteGallery | null;
};

// The provider upload may use its entire 90-second timeout. Keep enough time
// to commit the returned code; a later worker can perform the gallery reread.
const UPLOAD_TIMEOUT_MS = 90_000;
const UPLOAD_CHECKPOINT_MARGIN_MS = 10_000;
// A delete includes the POST and a paginated confirmation read in image-ops.
const DELETE_CONFIRMATION_BUDGET_MS = 80_000;
const READ_CONFIRMATION_MARGIN_MS = 15_000;

export function canStartRebuildEffect(remainingMs: number, kind: "delete" | "insert"): boolean {
  return remainingMs >= (kind === "insert"
    ? UPLOAD_TIMEOUT_MS + UPLOAD_CHECKPOINT_MARGIN_MS
    : DELETE_CONFIRMATION_BUDGET_MS);
}

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

/** Confere TODOS os arquivos antes de qualquer exclusão remota. */
export async function validateRebuildSources(admin: Admin, imageIds: readonly string[], byId: Map<string, Image>): Promise<string | null> {
  for (const imageId of imageIds) {
    const image = byId.get(imageId);
    if (!image) return "arquivo_indisponivel";
    try { await source(admin, image); } catch (error) {
      return error instanceof Error ? error.message : "arquivo_indisponivel";
    }
  }
  return null;
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

export function newCodesSince(beforeCodes: readonly string[], gallery: RemoteGallery, linkedCodes: ReadonlySet<string>): string[] {
  const before = new Set(beforeCodes);
  return gallery.items.map((item) => item.codigoImagem)
    .filter((code): code is string => Boolean(code) && !before.has(code as string) && !linkedCodes.has(code as string));
}

async function confirmInsert(admin: Admin, params: Params, checkpoint: Checkpoint, gallery: RemoteGallery, linkedCodes: ReadonlySet<string>): Promise<boolean> {
  const op = checkpoint.operation;
  if (!op || op.kind !== "insert") return false;
  if (!gallery.reliable) return false;
  // O site nem sempre devolve o código no envio: UMA foto nova em relação ao
  // "antes" gravado, e sem dono no Gestão, é a foto enviada (causa do
  // travamento de 09/10/2026: sem isso a rodada parava para sempre).
  if (!op.externalImageId) {
    const fresh = newCodesSince(op.beforeCodes, gallery, linkedCodes);
    if (fresh.length !== 1) return false;
    op.externalImageId = fresh[0]!;
  }
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
    verification: { matched_by: "codigo_ou_janela_before_codes" },
  });
  checkpoint.insertIndex += 1;
  delete checkpoint.operation;
  await persistCheckpoint(admin, params, checkpoint);
  return true;
}

/** Each external effect has a committed intent before the call. A lost response never becomes a blind retry. */
export async function rebuildRemoteOrderDurable(admin: Admin, params: Params): Promise<Result> {
  let gallery = params.gallery;
  // Sem leitura confiável nada é decidido: o checkpoint em andamento fica intacto.
  if (!gallery.reliable) return { deleted: 0, reinserted: 0, pending: true, reason: gallery.reason, checkpoint: undefined, outcome: "paused", gallery };

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

  const linkedCodes = new Set(codeToImage.keys());
  const paused = (deleted: number, reinserted: number, reason: string, cp: Checkpoint | null = checkpoint): Result =>
    ({ deleted, reinserted, pending: true, reason, checkpoint: cp, outcome: "paused", gallery });

  // Envio anterior sem resposta: confirma pelo código devolvido ou pela janela
  // before_codes. Ausência comprovada (leitura confiável, nada novo) volta a
  // enviar UMA vez. Duas ou mais fotos novas = continua incerto, sem reenvio.
  if (checkpoint?.operation?.kind === "insert") {
    if (!(await confirmInsert(admin, params, checkpoint, gallery, linkedCodes))) {
      const op = checkpoint.operation as Extract<Operation, { kind: "insert" }>;
      const fresh = newCodesSince(op.beforeCodes, gallery, linkedCodes);
      const retried = checkpoint.absentRetried ?? [];
      if (fresh.length === 0 && op.beforeCodes.length > 0 && !retried.includes(op.imageId)) {
        checkpoint.absentRetried = [...retried, op.imageId];
        delete checkpoint.operation;
        await persistCheckpoint(admin, params, checkpoint);
        await persistLink(admin, params, {
          image_id: op.imageId, publication_id: params.publicationId, provider: params.provider,
          desired_state: "present", status: "pending", last_op: "rebuild_insert",
          last_op_state: "absent_after_read", error_class: null, last_error_message: null,
        });
      } else {
        await persistLink(admin, params, {
          image_id: op.imageId, publication_id: params.publicationId, provider: params.provider,
          desired_state: "present", status: "delivery_unknown", last_op: "rebuild_insert",
          last_op_state: "delivery_unknown", error_class: "entrega_ambigua",
          last_error_message: "Envio sem código de imagem confirmado; requer evidência do provedor.",
          next_retry_at: null,
        });
        return paused(0, 0, "delivery_unknown");
      }
    }
  }

  if (checkpoint && checkpoint.revision !== params.galleryRevision && !checkpoint.operation) {
    checkpoint = null;
    await persistCheckpoint(admin, params, null);
  }
  if (!checkpoint) {
    const remote: RebuildRemoteItem[] = displayOrder(gallery.items).map((item) => ({
      codigoImagem: item.codigoImagem,
      imageId: item.codigoImagem ? codeToImage.get(item.codigoImagem) ?? null : null,
      destaque: item.destaque,
    }));
    const desiredDrift = params.desiredImageIds.find((id) => params.contentDrift.includes(id)) ?? null;
    const plan = planGalleryRebuild({
      desiredImageIds: params.desiredImageIds, remote, rebuildFromImageId: desiredDrift,
    });
    if (!plan.needed) return { deleted: 0, reinserted: 0, pending: false, reason: null, checkpoint: null, outcome: "completed", gallery };
    if (!plan.feasible) return {
      deleted: 0, reinserted: 0, pending: true, reason: plan.reason,
      checkpoint: { state: "blocked", reason: plan.reason }, outcome: "abandoned", gallery,
    };
    // Validate ALL originals/derivatives before any remote effect.
    for (const imageId of plan.reinsertImageIds) {
      const image = params.byId.get(imageId);
      if (!image) return paused(0, 0, "arquivo_indisponivel", null);
      try { await source(admin, image); } catch (error) {
        return paused(0, 0, error instanceof Error ? error.message : "arquivo_indisponivel", null);
      }
    }
    checkpoint = {
      revision: params.galleryRevision, phase: "reinserting", deleteRemoteIds: plan.deleteRemoteIds,
      reinsertImageIds: plan.reinsertImageIds, deleteIndex: 0, insertIndex: 0, keptPrefix: plan.keptPrefix,
    };
    await params.progress();
  }

  // Enviar primeiro, apagar depois: converte checkpoints antigos (que apagavam
  // tudo antes de reenviar). Só a capa antiga sai antes, pois o site aceita uma.
  if (!checkpoint.insertFirst) {
    const remaining = checkpoint.deleteRemoteIds.slice(checkpoint.deleteIndex);
    const coverCode = checkpoint.keptPrefix === 0
      ? remaining.find((code) => gallery.items.some((item) => item.codigoImagem === code && item.destaque)) ?? null
      : null;
    checkpoint = {
      ...checkpoint, insertFirst: true, phase: "reinserting", coverCode, coverDone: !coverCode,
      startCount: checkpoint.startCount ?? gallery.items.length,
      deleteRemoteIds: remaining.filter((code) => code !== coverCode), deleteIndex: 0,
    };
    await persistCheckpoint(admin, params, checkpoint);
  }

  let deleted = 0;
  let reinserted = 0;
  const desiredCount = params.desiredImageIds.length;
  const startCount = checkpoint.startCount ?? gallery.items.length;

  const guardedDelete = async (code: string): Promise<string | null> => {
    const allowed = deletionAllowed({
      reliable: gallery.reliable, deletedThisRun: deleted, startCount, desiredCount,
      currentCount: gallery.items.length,
    });
    if (!allowed.ok) return allowed.reason;
    if (!canStartRebuildEffect(params.remainingMs(), "delete")) return "continuacao_agendada";
    const imageId = codeToImage.get(code) ?? null;
    await params.progress();
    checkpoint!.operation = { kind: "delete", code, imageId };
    await persistCheckpoint(admin, params, checkpoint!);
    if (gallery.items.some((item) => item.codigoImagem === code)) {
      await params.progress();
      const result = await deleteRemoteImage(params.provider, params.externalId, code, params.correlationId);
      if (!result.confirmed) return "exclusao_nao_confirmada";
    }
    gallery = await fetchRemoteGallery(params.provider, params.externalId, params.correlationId);
    if (!gallery.reliable || gallery.items.some((item) => item.codigoImagem === code)) return "exclusao_nao_confirmada";
    await params.progress();
    if (imageId && !checkpoint!.reinsertImageIds.slice(0, checkpoint!.insertIndex).includes(imageId)) {
      await persistLink(admin, params, {
        image_id: imageId, publication_id: params.publicationId, provider: params.provider,
        desired_state: "present", status: "pending", external_image_id: null, remote_url: null,
        is_cover: false, synced_position: null, last_op: "rebuild_delete", last_op_state: "confirmed",
        attempts: 0, next_retry_at: null,
      });
    }
    delete checkpoint!.operation;
    deleted += 1;
    return null;
  };

  // 1) Capa antiga (só quando a capa muda).
  if (checkpoint.coverCode && !checkpoint.coverDone) {
    const blocked = await guardedDelete(checkpoint.coverCode);
    if (blocked) { await persistCheckpoint(admin, params, checkpoint); return paused(deleted, 0, blocked); }
    checkpoint.coverDone = true;
    await persistCheckpoint(admin, params, checkpoint);
  }

  // 2) Reenvio na ordem do Gestão (aparece no fim da galeria do site).
  while (checkpoint.insertIndex < checkpoint.reinsertImageIds.length) {
    if (!canStartRebuildEffect(params.remainingMs(), "insert")) return paused(deleted, reinserted, "continuacao_agendada");
    const imageId = checkpoint.reinsertImageIds[checkpoint.insertIndex]!;
    const image = params.byId.get(imageId);
    if (!image) return paused(deleted, reinserted, "arquivo_indisponivel");
    if (!gallery.reliable) return paused(deleted, reinserted, "leitura_inconclusiva");
    await params.progress();
    const prepared = await source(admin, image);
    if (!canStartRebuildEffect(params.remainingMs(), "insert")) return paused(deleted, reinserted, "continuacao_agendada");
    const asCover = imageId === params.desiredImageIds[0] && gallery.items.every((item) => !item.destaque);
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
    await params.progress();
    if (!canStartRebuildEffect(params.remainingMs(), "insert")) {
      delete checkpoint.operation;
      await persistCheckpoint(admin, params, checkpoint);
      await persistLink(admin, params, {
        image_id: imageId, publication_id: params.publicationId, provider: params.provider,
        desired_state: "present", status: "pending", last_op: "rebuild_insert",
        last_op_state: "deferred_no_post", error_class: null, last_error_message: null,
      });
      return paused(deleted, reinserted, "continuacao_agendada");
    }
    try {
      const response = await imobiRequest(params.provider,
        `/imovel/${encodeURIComponent(params.externalId)}/imagem/inserir`, {
          method: "POST", formData: form, extraHeaders: { codigoImovel: params.externalId },
          correlationId: params.correlationId, timeoutMs: 90_000, retryOnNetwork: false,
        });
      const code = extractInsertedImageId(response.data);
      if (code) {
        checkpoint.operation.externalImageId = code;
        await persistCheckpoint(admin, params, checkpoint);
      }
    } catch {
      return paused(deleted, reinserted, "delivery_unknown");
    }
    if (params.remainingMs() < READ_CONFIRMATION_MARGIN_MS) return paused(deleted, reinserted, "confirmacao_agendada");
    gallery = await fetchRemoteGallery(params.provider, params.externalId, params.correlationId);
    if (!(await confirmInsert(admin, params, checkpoint, gallery, linkedCodes)))
      return paused(deleted, reinserted, "delivery_unknown");
    reinserted += 1;
  }

  // 3) Só agora, com todas as substitutas confirmadas, retira as antigas.
  checkpoint.phase = "deleting";
  while (checkpoint.deleteIndex < checkpoint.deleteRemoteIds.length) {
    if (deleted >= MAX_DELETES_PER_RUN) { await persistCheckpoint(admin, params, checkpoint); return paused(deleted, reinserted, "continuacao_agendada"); }
    const blocked = await guardedDelete(checkpoint.deleteRemoteIds[checkpoint.deleteIndex]!);
    if (blocked) { await persistCheckpoint(admin, params, checkpoint); return paused(deleted, reinserted, blocked); }
    checkpoint.deleteIndex += 1;
    await persistCheckpoint(admin, params, checkpoint);
  }

  await params.progress();
  await persistCheckpoint(admin, params, null);
  return { deleted, reinserted, pending: false, reason: null, checkpoint: null, outcome: "completed", gallery };
}
