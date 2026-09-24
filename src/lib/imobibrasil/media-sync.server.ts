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

import { shouldSendAsCover } from "./cover-decision";
import type { SupabaseClient } from "@supabase/supabase-js";
import { imobiRequest } from "./client.server";
import { toImobiError } from "./errors";
import { boolToImageSimNao } from "./serializers";
import { extractInsertedImageId } from "./image-parsers";
import { deleteRemoteImage, fetchRemoteGallery, type RemoteGallery } from "./image-ops.server";
import { rebuildRemoteOrderDurable } from "./media-rebuild.server";
import type { ImobiProvider } from "./providers";
import { canPublishPropertyImage } from "@/lib/imoveis/image-status";
import { classifyImageDeliveryError, nextImageRetryAt } from "@/lib/imoveis/delivery";
import { fetchDeliveryBytes } from "@/lib/imoveis/delivery.server";
import { galleryMatchesExactly } from "@/lib/imoveis/gallery-rebuild";
import {
  isAmbiguousDeliveryError,
  isExtensionError,
  isRateLimitError,
  planGalleryDelivery,
  sendOrderForSite,
  safeDeliveryFileName,
  sortGallery,
  type LocalGalleryImage,
  type RemoteGalleryRow,
} from "@/lib/imoveis/gallery-plan";

type Admin = SupabaseClient;

const BUCKET = "property-images";

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
    | "blocked_image"
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
  processing_error_code: string | null;
  processing_started_at: string | null;
  destination_hash: string | null;
  desired_destination_hash: string | null;
  updated_at: string | null;
  pending_remote_delete: boolean | null;
};

type LinkRow = RemoteGalleryRow & {
  external_image_id: string | null;
  remote_url: string | null;
  desired_state: string | null;
  deleted_at: string | null;
  pending_delete_at: string | null;
  updated_at?: string | null;
  verification?: Record<string, unknown> | null;
};

/** Janela antes de considerar ausente um envio incerto (leitura completa sem a foto). */
export const ABSENT_UNKNOWN_WINDOW_MS = 10 * 60_000;

export function shouldResendAbsentUnknown(
  row: { updated_at?: string | null; verification?: Record<string, unknown> | null },
  now: number,
): boolean {
  if (row.verification && row.verification["resent_after_absent"] === true) return false;
  const at = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  return Number.isFinite(at) && now - at >= ABSENT_UNKNOWN_WINDOW_MS;
}

const LINK_COLUMNS =
  "image_id, content_hash, status, synced_position, is_cover, attempts, next_retry_at, last_op, last_op_state, external_image_id, remote_url, desired_state, deleted_at, pending_delete_at, updated_at, verification";

async function persistLink(
  admin: Admin,
  ownership: { jobId: string; leaseToken: string; publicationId: string },
  payload: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await admin.rpc("property_media_link_write_if_owned" as never, {
    _job_id: ownership.jobId, _lease_token: ownership.leaseToken,
    _publication_id: ownership.publicationId, _image_id: payload.image_id,
    _fields: payload,
  } as never);
  if (error || data !== true)
    throw new Error(`media_link_persist_failed: ${error?.message ?? "lease lost"}`);
}

async function assertMediaStillAllowed(admin: Admin, propertyId: string, publicationId: string, revision: number): Promise<void> {
  const [{ data: property, error: propertyError }, { data: publication, error: publicationError }] = await Promise.all([
    admin.from("properties").select("gallery_revision, archived_at").eq("id", propertyId).single(),
    admin.from("property_provider_publications")
      .select("enabled, desired_availability, external_property_id")
      .eq("id", publicationId).single(),
  ]);
  if (propertyError || publicationError) throw new Error(propertyError?.message ?? publicationError?.message);
  if (property.archived_at || publication.enabled === false ||
      publication.desired_availability !== "visible" || !publication.external_property_id)
    throw new Error("media_publication_disabled");
  if (Number(property.gallery_revision ?? 0) !== revision) throw new Error("media_revision_superseded");
}

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
    jobId: string;
    leaseToken: string;
    galleryRevision?: number;
    verifyRemote?: boolean;
    /** Renovação de reserva/checkpoint entre passos longos. */
    onProgress?: () => Promise<void>;
    budgetMs?: number;
  },
): Promise<MediaSyncResult> {
  const started = Date.now();
  const budgetMs = params.budgetMs ?? DEFAULT_BUDGET_MS;
  const remainingMs = () => budgetMs - (Date.now() - started);
  const outOfBudget = () => remainingMs() < 15_000;
  const progress = async () => {
    if (params.onProgress) await params.onProgress();
    await assertMediaStillAllowed(admin, params.propertyId, params.publicationId, galleryRevision);
  };
  const { propertyId, provider, publicationId, externalId, correlationId } = params;

  const { data: priorState, error: priorStateError } = await admin
    .from("property_provider_publications")
    .select("media_rebuild_state")
    .eq("id", publicationId).single();
  if (priorStateError) throw new Error(priorStateError.message);
  const priorCheckpoint = priorState.media_rebuild_state as Record<string, unknown> | null;
  const rebuildingFromCheckpoint = Boolean(priorCheckpoint &&
    Array.isArray(priorCheckpoint.deleteRemoteIds) &&
    Array.isArray(priorCheckpoint.reinsertImageIds));

  let galleryRevision = params.galleryRevision ?? 0;
  if (!galleryRevision) {
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("gallery_revision")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    galleryRevision = Number(property?.gallery_revision ?? 1);
  }

  const all = await loadImages(admin, propertyId);
  const now = Date.now();

  // Foto marcada para remoção sai da galeria desejada imediatamente.
  const active = all.filter((image) => !image.pending_remote_delete);
  const unready = active.filter((image) => !canPublishPropertyImage(image));
  const blockedImage = unready.find((image) =>
    ["failed_permanent", "failed"].includes(image.processing_status));
  const publishable = sortGallery(active.filter(canPublishPropertyImage).map(toLocal));
  const byId = new Map(all.map((image) => [image.id, image]));

  const { data: linkRows, error: linkError } = await admin
    .from("property_image_provider_publications")
    .select(LINK_COLUMNS)
    .eq("publication_id", publicationId);
  if (linkError) throw new Error(linkError.message);
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

  // Envio incerto com UMA foto sem dono no site (leitura completa): é a foto
  // enviada. Resolve sem reenviar; com 0 ou 2+ candidatas continua incerto.
  if (plan.unknown.length === 1 && gallery.reliable) {
    const known = new Set(
      links.filter((row) => row.desired_state !== "absent" && !row.deleted_at)
        .map((row) => row.external_image_id).filter(Boolean),
    );
    const orphans = gallery.items.filter((item) => item.codigoImagem && !known.has(item.codigoImagem));
    if (orphans.length === 1) {
      await persistLink(admin, params, {
        image_id: plan.unknown[0]!, publication_id: publicationId, provider,
        status: "synced", external_image_id: orphans[0]!.codigoImagem,
        last_op: "insert", last_op_state: "confirmed_by_read",
        error_class: null, last_error_message: null,
      });
      plan.unknown = [];
      unknownCount = 0;
    }
  }
  // Envio incerto AUSENTE do site (causa do 1386/Cordial, 24/09): a intenção
  // foi gravada, mas o POST não concluiu e a leitura completa não mostra
  // nenhuma foto sem dono. Passada a janela de conferência, a foto volta à fila
  // UMA única vez. Se já houve reenvio, continua incerta (sem risco de cópia).
  if (plan.unknown.length > 0 && gallery.reliable) {
    const known = new Set(
      links.filter((row) => row.desired_state !== "absent" && !row.deleted_at)
        .map((row) => row.external_image_id).filter(Boolean),
    );
    const orphanCount = gallery.items.filter((item) => item.codigoImagem && !known.has(item.codigoImagem)).length;
    if (orphanCount === 0) {
      for (const imageId of [...plan.unknown]) {
        const row = links.find((link) => link.image_id === imageId);
        if (!row || !shouldResendAbsentUnknown(row, now)) continue;
        await persistLink(admin, params, {
          image_id: imageId, publication_id: publicationId, provider,
          status: "pending", last_op: "insert", last_op_state: "absent_after_read",
          external_image_id: null, error_class: null, last_error_message: null,
          verification: { ...(row.verification ?? {}), resent_after_absent: true, checked_at: new Date(now).toISOString() },
        });
        plan.unknown = plan.unknown.filter((id) => id !== imageId);
        unknownCount -= 1;
        const local = publishable.find((image) => image.id === imageId);
        if (local) plan.toSend.push(local);
      }
    }
  }

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
  for (const row of toDelete) {
    if (outOfBudget()) break;
    await progress();
    if (!gallery.reliable) break;
    const code = row.external_image_id as string;
    await persistLink(admin, params, {
      ...row, image_id: row.image_id, publication_id: publicationId, provider,
      last_op: "delete", last_op_state: "intent_persisted", desired_state: "absent",
    });
    const result = gallery.items.some((item) => item.codigoImagem === code)
      ? await deleteRemoteImage(provider, externalId, code, correlationId)
      : { confirmed: true, alreadyAbsent: true, message: null };
    if (result.confirmed) {
      deletedCount += 1;
      await persistLink(admin, params, {
        image_id: row.image_id, publication_id: publicationId, provider,
        status: "deleted", deleted_at: new Date().toISOString(),
        last_op: "delete",
        last_op_state: result.alreadyAbsent ? "already_absent" : "confirmed",
        last_error_message: null, error_class: null,
      });
    } else {
      await persistLink(admin, params, {
        image_id: row.image_id, publication_id: publicationId, provider,
        last_op: "delete", last_op_state: "pending",
        error_class: "exclusao_pendente",
        last_error_message: result.message ?? "Exclusão não confirmada pelo site.",
        attempts: Number(row.attempts ?? 0) + 1,
        next_retry_at: nextImageRetryAt("rede", Number(row.attempts ?? 0) + 1),
      });
    }
    gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  }

  // Foto local removida em TODOS os destinos: agora sim o registro e os arquivos
  // podem sair (antes disso, apagar impediria a recuperação).
  await purgeFullyDeletedImages(admin, propertyId);

  // -------------------------------------------------------------- inserções
  // O Gestão é a fonte da verdade: fotos pendentes são enviadas na ordem do
  // Gestão mesmo quando a leitura do site é inconclusiva. A confirmação vem do
  // código de imagem devolvido pelo próprio envio; sem código, a entrega fica
  // incerta e nunca é repetida às cegas.
  const linkCoverKnown = links.some((row) =>
    row.desired_state !== "absent" && row.status === "synced" && Boolean(row.is_cover));
  // O site mostra cada foto nova logo após a capa. Se uma foto pendente deve
  // ficar DEPOIS de fotos já no site (ex.: acrescentada no fim), retira (com
  // confirmação) as já enviadas que ficam antes dela e reenvia tudo em ordem.
  // Falha numa retirada = não envia nada agora.
  const coverId = publishable[0]?.id;
  const positionOf = new Map(publishable.map((image) => [image.id, image.position]));
  const pendingPositions = plan.toSend.filter((i) => i.id !== coverId).map((i) => i.position);
  const lastPending = pendingPositions.length ? Math.max(...pendingPositions) : -Infinity;
  const displaced = links.filter((row) =>
    row.desired_state !== "absent" && !row.deleted_at && row.status === "synced" &&
    row.external_image_id && row.image_id !== coverId &&
    (positionOf.get(row.image_id) ?? Infinity) < lastPending);
  const reordered: typeof plan.toSend = [];
  let reorderBlocked = false;
  if (displaced.length && !rebuildingFromCheckpoint && unknownCount === 0) {
    if (!gallery.reliable) reorderBlocked = true;
    for (const row of reorderBlocked ? [] : displaced) {
      if (outOfBudget()) { reorderBlocked = true; break; }
      await progress();
      const code = row.external_image_id as string;
      const result = gallery.items.some((item) => item.codigoImagem === code)
        ? await deleteRemoteImage(provider, externalId, code, correlationId)
        : { confirmed: true, alreadyAbsent: true, message: null };
      if (!result.confirmed) { reorderBlocked = true; break; }
      await persistLink(admin, params, {
        image_id: row.image_id, publication_id: publicationId, provider,
        status: "pending", external_image_id: null, remote_url: null, is_cover: false,
        synced_position: null, last_op: "delete", last_op_state: "reorder_reset",
        error_class: null, last_error_message: null,
      });
      const image = publishable.find((i) => i.id === row.image_id);
      if (image) reordered.push(image);
    }
  }
  // Foto aguardando nova tentativa: não envia outras antes dela (o site
  // ordena pela sequência de envio). Espera o horário e segue em ordem.
  const nowMs = Date.now();
  const waitingRetry = links.some((row) =>
    row.desired_state !== "absent" && !row.deleted_at && row.status === "error" &&
    row.next_retry_at && new Date(String(row.next_retry_at)).getTime() > nowMs);
  const sendQueue = reorderBlocked || waitingRetry ? [] : sendOrderForSite([...plan.toSend, ...reordered], coverId);
  for (const target of rebuildingFromCheckpoint || unknownCount > 0 ? [] : sendQueue) {
    // A chamada pode durar 90 s; reserve ainda releitura e checkpoint local.
    if (remainingMs() < 95_000) break;
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
    // Capa: só um destaque pode existir. Destaque=Sim apenas para a primeira
    // foto do Gestão, quando nem o site (leitura) nem os vínculos têm capa.
    const asCover = shouldSendAsCover({
      readReliable: gallery.reliable,
      remoteHasCover: gallery.items.some((item) => item.destaque),
      linkHasCover: linkCoverKnown,
      coversSentThisRun,
      isFirstDesired: publishable[0]?.id === image.id,
    });

    let postReturned = false;
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

      // A leitura do Storage também consome o deadline. Verifique orçamento e
      // posse imediatamente antes de persistir a intenção e iniciar o POST.
      await progress();
      if (remainingMs() < 95_000) break;

      // Intenção e conjunto anterior ficam duráveis ANTES do POST. Se o processo
      // cair entre o efeito remoto e a confirmação local, a próxima execução
      // reconhece delivery_unknown e nunca repete o upload às cegas.
      const beforeCodes = gallery.items.map((item) => item.codigoImagem).filter(Boolean);
      await persistLink(admin, params, {
        image_id: image.id, publication_id: publicationId, provider,
        content_hash: deliveredHash(image), delivery_file_name: fileName,
        desired_state: "present", status: "delivery_unknown",
        last_op: "insert", last_op_state: "intent_persisted",
        verification: { before_codes: beforeCodes, correlation_id: correlationId, at: new Date().toISOString() },
      });

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

      const after = await fetchRemoteGallery(provider, externalId, correlationId);
      // O site nem sempre devolve o código no envio. Com a leitura completa e a
      // posse exclusiva deste anúncio, UMA foto nova em relação à lista anterior
      // é a foto enviada agora.
      const newRemote = after.reliable && gallery.reliable
        ? after.items.filter((item) => item.codigoImagem && !beforeCodes.includes(item.codigoImagem))
        : [];
      const externalImageId = extractInsertedImageId(response.data) ??
        (newRemote.length === 1 ? newRemote[0]!.codigoImagem : null);
      const readItem = externalImageId && after.reliable
        ? after.items.find((item) => item.codigoImagem === externalImageId)
        : null;
      // Leitura inconclusiva não invalida um envio aceito: o código devolvido
      // pelo site identifica a foto enviada.
      const confirmedItem = readItem ?? (externalImageId && !after.reliable
        ? { codigoImagem: externalImageId, url: null, destaque: asCover }
        : null);
      gallery = after;
      if (!confirmedItem) {
        unknownCount += 1;
        await persistLink(admin, params, {
          image_id: image.id, publication_id: publicationId, provider,
          content_hash: deliveredHash(image), delivery_file_name: fileName,
          desired_state: "present", status: "delivery_unknown", last_op: "insert",
          last_op_state: "delivery_unknown", error_class: "entrega_ambigua",
          last_error_message: "O site não devolveu um código de imagem verificável; envio mantido inconclusivo.",
          next_retry_at: null,
        });
        break;
      }
      await persistLink(admin, params,
        {
          image_id: image.id,
          publication_id: publicationId,
          provider,
          external_image_id: externalImageId,
          remote_url: confirmedItem.url,
          content_hash: deliveredHash(image),
          is_cover: confirmedItem.destaque,
          synced_position: image.position,
          delivery_file_name: fileName,
          desired_state: "present",
          status: "synced",
          last_op: "insert",
          last_op_state: "confirmed_by_read",
          last_error_message: null,
          error_class: null,
          attempts: 0,
          next_retry_at: null,
          synced_at: new Date().toISOString(),
        },
      );
      postReturned = true;
      sentCount += 1;
      if (confirmedItem.destaque) coversSentThisRun += 1;
      order.push({ imageId: image.id, position: image.position, externalImageId });
    } catch (error) {
      if (postReturned || (error instanceof Error && error.message.startsWith("media_link_persist_failed"))) throw error;
      const normalized = toImobiError(error);
      const attempts = previousAttempts + 1;

      // Entrega AMBÍGUA (timeout/rede/5xx): o site pode ter aceitado a foto.
      // Sem código devolvido pela operação, uma única foto nova na lista não
      // prova identidade: outro operador pode ter enviado uma foto ao mesmo tempo.
      if (
        isAmbiguousDeliveryError({
          category: normalized.category,
          ambiguous: normalized.ambiguous,
          status: normalized.httpStatus,
        })
      ) {
        const after = await fetchRemoteGallery(provider, externalId, correlationId);
        gallery = after;
        unknownCount += 1;
        errors.push({ imageId: image.id, message: normalized.message });
        await persistLink(admin, params,
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
            last_op_state: "delivery_unknown",
            last_error_message: normalized.message,
            error_class: "entrega_ambigua",
            attempts,
            next_retry_at: null,
          },
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
      await persistLink(admin, params,
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
      );
      // A ordem no site depende da sequência de envio: qualquer falha para
      // o envio aqui, para não pular fotos e inverter a ordem.
      break;
    }
  }

  // Releitura e reconciliação por código/endereço.
  if (params.verifyRemote !== false || sentCount > 0) {
    gallery = await fetchRemoteGallery(provider, externalId, correlationId);
  }
  await reconcileLinkCodes(admin, params, publishable, gallery);

  // ------------------------------------------------------- ordem e capa
  // Enquanto faltam fotos a enviar, a ordem exibida no site é parcial por
  // construção (o site mostra capa + da mais nova para a mais antiga, e o
  // envio segue essa sequência). Julgar a ordem agora faria a reconstrução
  // apagar fotos recém-enviadas a cada passagem — laço sem fim. A ordem só é
  // avaliada depois que todas as fotos do Gestão estão no site.
  const { data: beforeRebuildLinks } = await admin
    .from("property_image_provider_publications")
    .select("image_id, desired_state, status, deleted_at")
    .eq("publication_id", publicationId);
  const desiredIds = new Set(publishable.map((image) => image.id));
  const stillMissing = (beforeRebuildLinks ?? []).filter((row) =>
    desiredIds.has(row.image_id as string) &&
    row.desired_state !== "absent" && !row.deleted_at && row.status !== "synced",
  ).length;
  const missingLinks = publishable.length - (beforeRebuildLinks ?? []).filter(
    (row) => desiredIds.has(row.image_id as string) && row.status === "synced",
  ).length;
  const rebuild = unknownCount > 0 && !rebuildingFromCheckpoint
    ? { deleted: 0, reinserted: 0, pending: true, reason: "delivery_unknown",
        checkpoint: null, gallery }
    : (stillMissing > 0 || missingLinks > 0) && !rebuildingFromCheckpoint
    ? { deleted: 0, reinserted: 0, pending: true, reason: "envio_incompleto",
        checkpoint: null, gallery }
    : await rebuildRemoteOrderDurable(admin, {
    propertyId,
    provider,
    publicationId,
    externalId,
    correlationId,
    jobId: params.jobId,
    leaseToken: params.leaseToken,
    galleryRevision,
    desiredImageIds: publishable.map((image) => image.id),
    contentDrift: plan.contentDrift,
    gallery,
    byId,
    remainingMs,
    progress,
  });
  rebuiltCount = rebuild.reinserted;
  deletedCount += rebuild.deleted;
  if (rebuild.gallery) gallery = rebuild.gallery;

  const snapshot = snapshotOf(gallery);
  const remoteCount = gallery.reliable ? snapshot.count : null;
  const multipleCovers = gallery.reliable && snapshot.coverCount > 1;

  const { data: afterLinks, error: afterLinksError } = await admin
    .from("property_image_provider_publications")
    .select(LINK_COLUMNS)
    .eq("publication_id", publicationId);
  if (afterLinksError) throw new Error(afterLinksError.message);
  const finalLinks = (afterLinks ?? []) as unknown as LinkRow[];
  // Foto apagada no Gestão que nunca teve código no site: com leitura
  // confiável e todas as fotos do site pertencendo ao Gestão, não há o que
  // retirar — a exclusão fica confirmada sem nenhuma chamada ao site.
  if (gallery.reliable) {
    const presentCodes = new Set(finalLinks
      .filter((row) => row.desired_state !== "absent" && row.status === "synced" && row.external_image_id)
      .map((row) => String(row.external_image_id)));
    const noOrphans = gallery.items.every((item) => item.codigoImagem && presentCodes.has(item.codigoImagem));
    if (noOrphans) {
      for (const row of finalLinks) {
        if (row.desired_state !== "absent" || row.deleted_at || row.external_image_id) continue;
        const deletedAt = new Date().toISOString();
        await persistLink(admin, params, {
          image_id: row.image_id, publication_id: publicationId, provider,
          status: "deleted", deleted_at: deletedAt, last_op: "delete", last_op_state: "already_absent",
          error_class: null, last_error_message: null,
        });
        row.deleted_at = deletedAt;
      }
    }
  }
  const pendingDeleteCount = finalLinks.filter(
    (row) => row.desired_state === "absent" && !row.deleted_at,
  ).length;
  const syncedTotal = finalLinks.filter(
    (row) => row.desired_state !== "absent" && row.status === "synced",
  ).length;
  const confirmedContent = publishable.every((image) => {
    const link = finalLinks.find((row) => row.image_id === image.id && row.desired_state !== "absent");
    return link?.status === "synced" && Boolean(link.external_image_id) &&
      link.content_hash != null && link.content_hash === image.deliveredHash;
    });

  const extraRemote = remoteCount !== null && remoteCount > plan.expectedCount;
  // Conferência completa pela leitura: quantidade, fotos, ordem e capa.
  const codeToImage = new Map(
    finalLinks
      .filter((row) => row.external_image_id && row.desired_state !== "absent")
      .map((row) => [row.external_image_id as string, row.image_id]),
  );
  const exactMatch =
    gallery.reliable &&
    galleryMatchesExactly({
      desiredImageIds: publishable.map((image) => image.id),
      remote: gallery.items.map((item) => ({
        codigoImagem: item.codigoImagem,
        imageId: item.codigoImagem ? (codeToImage.get(item.codigoImagem) ?? null) : null,
        destaque: item.destaque,
      })),
    });
  const rebuildPending = rebuild.pending;
  const complete =
    syncedTotal === plan.expectedCount &&
    confirmedContent &&
    unready.length === 0 &&
    failedCount === 0 &&
    unknownCount === 0 &&
    pendingDeleteCount === 0 &&
    !rebuildPending &&
    gallery.reliable &&
    !multipleCovers &&
    !extraRemote &&
    exactMatch;

  const status: MediaSyncResult["status"] = blockedImage
    ? "blocked_image"
    : unready.length
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
    : blockedImage
      ? blockedImage.processing_error_code ?? "image_processing_blocked"
      : unready.length
        ? "marca_em_processamento"
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

  await progress();
  const { data: publicationOwned, error: publicationUpdateError } = await admin.rpc(
    "property_publication_update_if_owned" as never, {
      _job_id: params.jobId,
      _lease_token: params.leaseToken,
      _publication_id: publicationId,
      _fields: {
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
      },
    } as never,
  );
  if (publicationUpdateError) throw new Error(publicationUpdateError.message);
  if (publicationOwned !== true) throw new Error("media_lease_lost: confirmação obsoleta recusada.");

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

/** Uma lista de fotos não fornece identidade suficiente para vincular uma foto sem código. */
async function reconcileLinkCodes(
  admin: Admin,
  ownership: { jobId: string; leaseToken: string; publicationId: string },
  desired: readonly LocalGalleryImage[],
  gallery: RemoteGallery,
): Promise<void> {
  if (!gallery.reliable) return;
  const publicationId = ownership.publicationId;
  const { data, error } = await admin
    .from("property_image_provider_publications")
    .select("image_id, external_image_id, remote_url, status, desired_state")
    .eq("publication_id", publicationId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    image_id: string;
    external_image_id: string | null;
    remote_url: string | null;
    status: string | null;
    desired_state: string | null;
  }>;

  const pending = desired
    .map((image) => rows.find((row) => row.image_id === image.id))
    .filter(
      (row): row is (typeof rows)[number] =>
        Boolean(row) && row!.status === "synced" && !row!.external_image_id,
    );

  for (const row of pending) {
    await persistLink(admin, ownership, {
      image_id: row.image_id, publication_id: publicationId,
      status: "delivery_unknown",
      verification: { matched_by: null, ambiguous: true, reason: "codigo_da_operacao_ausente" },
      last_op_state: "delivery_unknown",
    });
  }

  // Adoção de código órfão: a API de inserção não devolve o código da foto,
  // então uma entrega fica "incerta". Com leitura confiável, se existe UMA
  // única foto do site sem par local e UMA única entrega incerta, o código é
  // dela — a entrega passa a confirmada sem reenvio nenhum.
  const { data: after } = await admin
    .from("property_image_provider_publications")
    .select("image_id, external_image_id, status, desired_state")
    .eq("publication_id", publicationId);
  const afterRows = (after ?? []) as typeof rows;
  const takenCodes = new Set(
    afterRows
      .filter((row) => row.external_image_id && row.desired_state !== "absent")
      .map((row) => String(row.external_image_id)),
  );
  // Entrega incerta que JÁ tem código e esse código aparece na galeria do
  // site: a foto entrou. Confirmação por leitura, sem reenvio.
  const remoteCodes = new Set(
    gallery.items
      .map((item) => item.codigoImagem)
      .filter((code): code is string => Boolean(code)),
  );
  for (const row of afterRows) {
    if (row.status !== "delivery_unknown" || row.desired_state === "absent") continue;
    const code = row.external_image_id ? String(row.external_image_id) : null;
    if (!code || !remoteCodes.has(code)) continue;
    await persistLink(admin, ownership, {
      image_id: row.image_id,
      publication_id: publicationId,
      status: "synced",
      last_op: "insert",
      last_op_state: "confirmed_by_read",
      error_class: null,
      last_error_message: null,
      verification: { matched_by: "codigo_na_galeria", ambiguous: false, reason: null },
    });
  }
  const orphans = gallery.items
    .map((item) => item.codigoImagem)
    .filter((code): code is string => Boolean(code) && !takenCodes.has(code as string));
  const unknowns = desired
    .map((image) => afterRows.find((row) => row.image_id === image.id))
    .filter(
      (row): row is (typeof rows)[number] =>
        Boolean(row) && row!.status === "delivery_unknown" && !row!.external_image_id,
    );
  if (orphans.length === 1 && unknowns.length === 1) {
    await persistLink(admin, ownership, {
      image_id: unknowns[0]!.image_id,
      publication_id: publicationId,
      status: "synced",
      external_image_id: orphans[0]!,
      last_op: "insert",
      last_op_state: "confirmed_by_orphan_code",
      error_class: null,
      last_error_message: null,
      verification: { matched_by: "codigo_orfao_unico", ambiguous: false, reason: null },
    });
  }
}


/**
 * Apaga registro e arquivos SOMENTE de fotos cuja remoção já foi confirmada em
 * todos os destinos. Enquanto houver destino pendente, tudo é preservado para
 * permitir a recuperação.
 */
export async function purgeFullyDeletedImages(admin: Admin, propertyId: string): Promise<number> {
  const { data: pendingImages, error: pendingImagesError } = await admin
    .from("property_images")
    .select(
      "id, storage_path, original_storage_path, processed_storage_path, thumbnail_storage_path",
    )
    .eq("property_id", propertyId)
    .eq("pending_remote_delete", true)
    .is("replacement_target_image_id", null);
  if (pendingImagesError) throw new Error(pendingImagesError.message);
  const rows = (pendingImages ?? []) as Array<Record<string, string | null>>;
  if (!rows.length) return 0;

  let purged = 0;
  for (const row of rows) {
    const imageId = row["id"] as string;
    const { data: links, error: linksError } = await admin
      .from("property_image_provider_publications")
      .select("id, desired_state, deleted_at")
      .eq("image_id", imageId);
    if (linksError) throw new Error(linksError.message);
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
    if (paths.length) {
      const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
      if (storageError) throw new Error(storageError.message);
    }
    purged += 1;
  }
  if (purged) {
    const { error: normalizeError } = await admin.rpc("property_images_normalize", { _property_id: propertyId });
    if (normalizeError) throw new Error(normalizeError.message);
  }
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
    lease_token?: string | null;
  },
  options: { onProgress?: () => Promise<void> } = {},
): Promise<MediaSyncResult | { status: "not_published" }> {
  const { data: publication, error: publicationError } = await admin
    .from("property_provider_publications")
    .select("id, external_property_id, enabled, status")
    .eq("property_id", job.property_id)
    .eq("provider", job.provider)
    .maybeSingle();
  if (publicationError) throw new Error(publicationError.message);

  if (!publication?.external_property_id || publication.enabled === false) {
    // Foto NUNCA cria imóvel no site. Se o vínculo existe mas o código remoto
    // está ausente, pedimos reconciliação (somente leitura por referência).
    if (publication && publication.enabled !== false) {
      const { error: reconcileError } = await admin.from("property_sync_jobs").upsert(
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
      if (reconcileError) throw new Error(reconcileError.message);
      return { status: "not_published" };
    }
    return { status: "not_published" };
  }

  // O agendamento do acompanhamento acontece junto do encerramento do job
  // (`property_media_finish_job`), para que uma alteração feita DURANTE o envio
  // gere processamento efetivo em vez de ficar apenas marcada.
  if (!job.lease_token) throw new Error("media_lease_lost: sem token de posse.");
  return deliverGallery(admin, {
    propertyId: job.property_id,
    provider: job.provider,
    publicationId: publication.id as string,
    externalId: publication.external_property_id as string,
    correlationId: job.correlation_id,
    jobId: job.id,
    leaseToken: job.lease_token,
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
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("gallery_revision, is_draft, archived_at")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) throw new Error(propertyError.message);
  if (!property || property.is_draft || property.archived_at) {
    return { enqueued: [], galleryRevision: Number(property?.gallery_revision ?? 1) };
  }
  const galleryRevision = Number(property.gallery_revision ?? 1);

  const { data: publications, error: publicationsError } = await admin
    .from("property_provider_publications")
    .select("provider, external_property_id, enabled")
    .eq("property_id", propertyId);
  if (publicationsError) throw new Error(publicationsError.message);

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
