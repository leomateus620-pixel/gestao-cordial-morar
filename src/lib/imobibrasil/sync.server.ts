/**
 * Worker de sincronização de imóveis com a ImobiBrasil. Server-only.
 *
 * Fluxo multi-etapas com estado `partial`: cadastro → características → imagens →
 * verificação remota. Nada é marcado como `published` sem confirmação por GET.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ImobiApiError, sanitizeMessage, toImobiError } from "./errors";
import { extractExternalId, imobiRequest, hasProviderToken } from "./client.server";
import { resolveProviderCodes } from "./catalogs.server";
import { extractPublicUrl } from "./public-url";

import {
  buildExternalReference,
  hashPayload,
  serializeProperty,
  boolToImageSimNao,
  type LocalPropertyForSync,
} from "./serializers";
import { canPublishPropertyImage } from "@/lib/imoveis/image-status";
import { classifyImageDeliveryError, nextImageRetryAt } from "@/lib/imoveis/delivery";
import { fetchDeliveryBytes } from "@/lib/imoveis/delivery.server";
import type { ImobiProvider } from "./providers";
import { providerExternalCode } from "./provider-code";

type Admin = SupabaseClient;

export type SyncJob = {
  id: string;
  property_id: string;
  provider: ImobiProvider;
  action: "publish" | "update" | "unpublish" | "delete" | "reconcile";
  requested_revision: number;
  correlation_id: string;
  attempts: number;
  max_attempts: number;
};

const IMAGE_CONCURRENCY = 2;

async function logAttempt(
  admin: Admin,
  job: SyncJob,
  entry: {
    step: string;
    ok: boolean;
    httpStatus?: number | null;
    durationMs?: number | null;
    errorCategory?: string | null;
    errorMessage?: string | null;
  },
) {
  await admin.from("property_sync_attempts").insert({
    job_id: job.id,
    attempt_number: job.attempts,
    correlation_id: job.correlation_id,
    step: entry.step,
    ok: entry.ok,
    http_status: entry.httpStatus ?? null,
    duration_ms: entry.durationMs ?? null,
    error_category: entry.errorCategory ?? null,
    error_message: entry.errorMessage ? sanitizeMessage(entry.errorMessage, 300) : null,
  });
}

function backoffSeconds(attempts: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1));
}

/** Procura a referência externa antes de qualquer criação — idempotência obrigatória. */
async function findRemoteByReference(
  provider: ImobiProvider,
  reference: string,
  correlationId: string,
): Promise<string | null> {
  const response = await imobiRequest(
    provider,
    `/imovel/lista?referencia=${encodeURIComponent(reference)}`,
    {
      method: "GET",
      correlationId,
    },
  );
  const items = Array.isArray(response.data)
    ? response.data
    : ((response.data as Record<string, unknown>)?.["resultSet"] ??
      (response.data as Record<string, unknown>)?.["data"] ??
      []);
  const list = Array.isArray(items)
    ? items
    : Array.isArray((items as Record<string, unknown>)?.["data"])
      ? ((items as Record<string, unknown>)["data"] as unknown[])
      : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const remoteRef = String(record["referenciaImovel"] ?? record["referencia"] ?? "").trim();
    if (remoteRef && remoteRef.toUpperCase() !== reference.toUpperCase()) continue;
    const id = extractExternalId(record);
    if (id) return id;
  }
  return null;
}

async function verifyRemote(provider: ImobiProvider, externalId: string, correlationId: string) {
  const response = await imobiRequest(provider, `/imovel/dados/${encodeURIComponent(externalId)}`, {
    method: "GET",
    extraHeaders: { codigoImovel: externalId },
    correlationId,
  });
  return response.data as Record<string, unknown>;
}

async function syncCharacteristics(
  admin: Admin,
  job: SyncJob,
  externalId: string,
  desiredCodes: string[],
) {
  if (!desiredCodes.length) return;
  for (const code of desiredCodes) {
    try {
      await imobiRequest(
        job.provider,
        `/imovel/${encodeURIComponent(externalId)}/caracteristica/inserir/${encodeURIComponent(code)}`,
        {
          method: "POST",
          extraHeaders: { codigoImovel: externalId, codigoCaracteristica: code },
          correlationId: job.correlation_id,
        },
      );
    } catch (error) {
      // Característica já associada não invalida a publicação.
      await logAttempt(admin, job, {
        step: "characteristic",
        ok: false,
        errorCategory: toImobiError(error).category,
        errorMessage: toImobiError(error).message,
      });
    }
  }
}

/** Foto travada há mais tempo que isso não segura mais a publicação do imóvel. */
const STUCK_IMAGE_WINDOW_MS = 15 * 60 * 1000;

async function syncImages(admin: Admin, job: SyncJob, publicationId: string, externalId: string) {
  const { data: images } = await admin
    .from("property_images")
    .select(
      "id, storage_path, processed_storage_path, processed_checksum, file_name, mime_type, content_hash, is_cover, position, processing_status, processing_started_at, updated_at",
    )
    .eq("property_id", job.property_id)
    // A galeria vai para o site exatamente na ordem escolhida no sistema.
    .order("position", { ascending: true });


  // Só publicamos fotos com marca-d'água aplicada (ou o acervo legado já publicado).
  // Fotos em andamento recentes seguram o envio; as travadas há muito tempo
  // apenas ficam de fora — os dados do imóvel nunca podem deixar de ir ao site
  // por causa de imagem, e a varredura automática as recupera depois.
  const allImages = images ?? [];
  const list = allImages.filter(canPublishPropertyImage);
  const now = Date.now();
  const inFlight = allImages.filter((image) => {
    if (!["pending", "processing"].includes(String(image.processing_status))) return false;
    const since = image.processing_started_at ?? image.updated_at;
    const age = since ? now - new Date(since as string).getTime() : 0;
    return age < STUCK_IMAGE_WINDOW_MS;
  }).length;
  if (inFlight > 0) {
    throw new Error(`${inFlight} foto(s) ainda estão recebendo a marca-d'água.`);
  }
  const skipped = allImages.length - list.length;
  if (skipped > 0) {
    await logAttempt(admin, job, {
      step: "images",
      ok: true,
      errorCategory: "skipped_images",
      errorMessage: `${skipped} foto(s) sem marca-d'água foram ignoradas no envio.`,
    });
  }
  if (!list.length) return { sent: 0, failed: 0, retrying: 0 };


  const { data: published } = await admin
    .from("property_image_provider_publications")
    .select("image_id, content_hash, external_image_id, status, attempts, next_retry_at, is_cover")
    .eq("publication_id", publicationId);
  const publishedIndex = new Map((published ?? []).map((row) => [row.image_id, row]));

  const deliveredHash = (image: (typeof list)[number]) =>
    image.processed_checksum ?? image.content_hash;

  const pending = list.filter((image) => {
    const existing = publishedIndex.get(image.id);
    if (!existing) return true;
    // Mudança de capa exige reenviar a foto para o site atualizar o destaque.
    const coverChanged = Boolean(existing.is_cover) !== Boolean(image.is_cover);
    const outdated =
      existing.status !== "synced" ||
      existing.content_hash !== deliveredHash(image) ||
      coverChanged;
    if (!outdated) return false;
    // Falha recente com nova tentativa marcada: respeita a espera programada.
    if (existing.status === "error" && existing.next_retry_at) {
      return new Date(existing.next_retry_at as string).getTime() <= now;
    }
    return true;
  });


  let sent = 0;
  let failed = 0;
  let retrying = 0;

  for (let index = 0; index < pending.length; index += IMAGE_CONCURRENCY) {
    const batch = pending.slice(index, index + IMAGE_CONCURRENCY);
    await Promise.all(
      batch.map(async (image) => {
        const previousAttempts = Number(publishedIndex.get(image.id)?.attempts ?? 0);
        try {
          const deliveryPath = image.processed_storage_path ?? image.storage_path;
          // A cópia de envio é reduzida no armazenamento até caber no limite do site.
          const delivery = await fetchDeliveryBytes(admin, "property-images", deliveryPath);
          const form = new FormData();
          form.append("imagem", delivery.blob, image.file_name);
          form.append("destaque", boolToImageSimNao(Boolean(image.is_cover)));
          const response = await imobiRequest(
            job.provider,
            `/imovel/${encodeURIComponent(externalId)}/imagem/inserir`,
            {
              method: "POST",
              formData: form,
              extraHeaders: { codigoImovel: externalId },
              correlationId: job.correlation_id,
              // Upload de imagem é bem mais lento que as chamadas de catálogo.
              timeoutMs: 90_000,
              retryOnNetwork: true,
            },
          );
          await admin.from("property_image_provider_publications").upsert(
            {
              image_id: image.id,
              publication_id: publicationId,
              provider: job.provider,
              external_image_id: extractExternalId(response.data),
              content_hash: deliveredHash(image),
              is_cover: Boolean(image.is_cover),
              status: "synced",
              last_error_message: null,
              error_class: null,
              attempts: 0,
              next_retry_at: null,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "image_id,publication_id" },
          );
          sent += 1;
        } catch (error) {
          failed += 1;
          const normalized = toImobiError(error);
          const attempts = previousAttempts + 1;
          const errorClass = classifyImageDeliveryError(normalized.message);
          const retryAt = nextImageRetryAt(errorClass, attempts);
          if (retryAt) retrying += 1;
          await admin.from("property_image_provider_publications").upsert(
            {
              image_id: image.id,
              publication_id: publicationId,
              provider: job.provider,
              content_hash: deliveredHash(image),
              is_cover: Boolean(image.is_cover),
              status: "error",
              last_error_message: normalized.message,
              error_class: errorClass,
              attempts,
              next_retry_at: retryAt,
            },
            { onConflict: "image_id,publication_id" },
          );
        }
      }),
    );
  }

  return { sent, failed, retrying };
}

async function loadProperty(admin: Admin, propertyId: string) {
  const { data, error } = await admin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ImobiApiError({ message: "Imóvel não encontrado.", category: "validation" });
  return data as unknown as LocalPropertyForSync & {
    cidade?: string | null;
    uf?: string | null;
    caracteristicas?: string[] | null;
    revision?: number;
  };
}

async function ensurePublication(
  admin: Admin,
  propertyId: string,
  provider: ImobiProvider,
  providerCode: string | null,
) {
  const { data } = await admin
    .from("property_provider_publications")
    .select("*")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await admin
    .from("property_provider_publications")
    .insert({
      property_id: propertyId,
      provider,
      external_reference: providerCode ?? buildExternalReference(propertyId),
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

/**
 * Garante o código real da imobiliária antes de publicar.
 * Se o imóvel ainda não tem `codigo_cordial` / `codigo_morar`, aloca o próximo
 * número livre daquela sequência e grava no cadastro. Falha aqui nunca trava a
 * fila: o fluxo segue com a referência técnica como último recurso.
 */
async function ensureProviderCode(
  admin: Admin,
  propertyId: string,
  provider: ImobiProvider,
  property: Record<string, unknown>,
): Promise<string | null> {
  const current = providerExternalCode(property, provider);
  if (current) return current;
  try {
    const { data, error } = await admin.rpc("allocate_provider_code_for_property", {
      _property_id: propertyId,
      _provider: provider,
    });
    if (error) throw new Error(error.message);
    const code = typeof data === "string" ? data.trim() : "";
    if (!code) return null;
    const column = provider === "cordial" ? "codigo_cordial" : "codigo_morar";
    (property as Record<string, unknown>)[column] = code;
    return code;
  } catch {
    return null;
  }
}


export async function processJob(admin: Admin, job: SyncJob) {
  const property = await loadProperty(admin, job.property_id);
  // Um imóvel publicado numa imobiliária sem código próprio recebe agora um número
  // real da sequência daquela imobiliária — nunca mais a referência técnica `GC-…`.
  const providerCode = await ensureProviderCode(admin, job.property_id, job.provider, property);
  const publication = await ensurePublication(admin, job.property_id, job.provider, providerCode);
  // Enquanto o imóvel não existe no site, a referência acompanha o código do provedor.
  let reference = publication.external_reference ?? buildExternalReference(job.property_id);
  const referenceIsSynthetic = /^GC-/i.test(reference);
  if (providerCode && reference !== providerCode && (!publication.external_property_id || referenceIsSynthetic)) {
    reference = providerCode;
    await admin
      .from("property_provider_publications")
      .update({ external_reference: providerCode })
      .eq("id", publication.id);
  }

  if (!hasProviderToken(job.provider)) {
    throw new ImobiApiError({
      message: `Token do provedor ${job.provider} não configurado.`,
      category: "config",
    });
  }

  await admin
    .from("property_provider_publications")
    .update({ status: "syncing", last_error_message: null })
    .eq("id", publication.id);

  const resolution = await resolveProviderCodes(admin, job.provider, {
    ...property,
    referencia: reference,
  });

  if (job.action === "unpublish") {
    // Arquivamento pedido pelo usuário: conclui assim que todos os sites confirmam.
    const { finalizePendingArchive } = await import("@/lib/imoveis/purge.server");
    if (!publication.external_property_id) {
      await admin
        .from("property_provider_publications")
        .update({ status: "unpublished", enabled: false, last_synced_at: new Date().toISOString() })
        .eq("id", publication.id);
      await finalizePendingArchive(admin, job.property_id);
      return { status: "unpublished" as const };
    }
    const payload = serializeProperty(
      { ...property, referencia: reference, exibir_imovel: false },
      resolution.codes,
      {
        mode: "update",
      },
    );
    await imobiRequest(
      job.provider,
      `/imovel/alterar/${encodeURIComponent(publication.external_property_id)}`,
      {
        method: "POST",
        json: payload,
        extraHeaders: { codigoImovel: publication.external_property_id },
        correlationId: job.correlation_id,
      },
    );
    await admin
      .from("property_provider_publications")
      .update({ status: "unpublished", enabled: false, last_synced_at: new Date().toISOString() })
      .eq("id", publication.id);
    await finalizePendingArchive(admin, job.property_id);
    return { status: "unpublished" as const };
  }

  if (job.action === "delete") {
    if (publication.external_property_id) {
      await imobiRequest(
        job.provider,
        `/imovel/excluir/${encodeURIComponent(publication.external_property_id)}`,
        {
          method: "POST",
          extraHeaders: { codigoImovel: publication.external_property_id },
          correlationId: job.correlation_id,
        },
      );
    }
    await admin
      .from("property_provider_publications")
      .update({
        status: "draft",
        enabled: false,
        external_property_id: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", publication.id);
    // Exclusão pedida pelo usuário: apaga o cadastro assim que todos os sites confirmarem.
    const { finalizePendingRemoval } = await import("@/lib/imoveis/purge.server");
    await finalizePendingRemoval(admin, job.property_id);
    return { status: "deleted" as const };
  }


  if (job.action === "reconcile") {
    return reconcilePublication(admin, publication, job.correlation_id);
  }

  // ---- publish / update ----
  let externalId = publication.external_property_id as string | null;

  // Resultado ambíguo anterior ou primeira publicação: sempre buscar a referência antes de criar.
  if (!externalId) {
    externalId = await findRemoteByReference(job.provider, reference, job.correlation_id);
  }

  const mode: "insert" | "update" = externalId ? "update" : "insert";
  const payload = serializeProperty({ ...property, referencia: reference }, resolution.codes, {
    mode,
  });
  const payloadHash = hashPayload(payload);

  if (externalId) {
    const unchanged =
      publication.last_payload_hash === payloadHash &&
      publication.last_synced_revision === (property.revision ?? 1) &&
      publication.status === "published";
    if (!unchanged) {
      const response = await imobiRequest(
        job.provider,
        `/imovel/alterar/${encodeURIComponent(externalId)}`,
        {
          method: "POST",
          json: payload,
          extraHeaders: { codigoImovel: externalId },
          correlationId: job.correlation_id,
        },
      );
      await logAttempt(admin, job, { step: "update", ok: true, httpStatus: response.httpStatus });
    }
  } else {
    const response = await imobiRequest(job.provider, "/imovel/inserir", {
      method: "POST",
      json: payload,
      allowRetry: false, // criação nunca sofre retry cego
      correlationId: job.correlation_id,
    });
    await logAttempt(admin, job, { step: "insert", ok: true, httpStatus: response.httpStatus });
    externalId =
      extractExternalId(response.data) ??
      (await findRemoteByReference(job.provider, reference, job.correlation_id));
    if (!externalId) {
      throw new ImobiApiError({
        message: "O provedor não retornou o código do imóvel e a referência não foi localizada.",
        category: "protocol",
        ambiguous: true,
      });
    }
  }

  await admin
    .from("property_provider_publications")
    .update({ external_property_id: externalId, status: "partial" })
    .eq("id", publication.id);

  await syncCharacteristics(admin, job, externalId, resolution.characteristicCodes);
  const media = await syncImages(admin, job, publication.id, externalId);

  // Verificação remota obrigatória antes de marcar como publicado.
  const remote = await verifyRemote(job.provider, externalId, job.correlation_id);
  const remoteSet = (remote?.["resultSet"] as Record<string, unknown> | undefined) ?? remote ?? {};
  const remoteReference = String(
    (remoteSet["referenciaImovel"] ??
      remoteSet["referencia"] ??
      remote?.["referencia"] ??
      "") as string,
  ).trim();
  const verified = !remoteReference || remoteReference.toUpperCase() === reference.toUpperCase();

  const finalStatus = verified && media.failed === 0 ? "published" : "partial";
  const publicUrl = extractPublicUrl(job.provider, remote, externalId);

  await admin
    .from("property_provider_publications")
    .update({
      status: finalStatus,
      last_payload_hash: payloadHash,
      last_synced_revision: property.revision ?? 1,
      last_synced_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      ...(publicUrl ? { external_public_url: publicUrl } : {}),
      last_error_category: finalStatus === "published" ? null : "media",
      last_error_message:
        finalStatus === "published"
          ? null
          : media.failed > 0
            ? `${media.failed} imagem(ns) não sincronizada(s).`
            : "Verificação remota divergente.",
    })
    .eq("id", publication.id);

  return { status: finalStatus, externalId, media, unmapped: resolution.unmapped };
}

export async function reconcilePublication(
  admin: Admin,
  publication: {
    id: string;
    provider: ImobiProvider;
    external_property_id: string | null;
    external_reference: string;
    last_payload_hash: string | null;
  },
  correlationId: string,
) {
  const externalId =
    publication.external_property_id ??
    (await findRemoteByReference(
      publication.provider,
      publication.external_reference,
      correlationId,
    ));

  if (!externalId) {
    await admin
      .from("property_provider_publications")
      .update({
        status: "out_of_sync",
        last_verified_at: new Date().toISOString(),
        last_error_message: "Imóvel não localizado no provedor.",
      })
      .eq("id", publication.id);
    return { status: "out_of_sync" as const };
  }

  const remote = await verifyRemote(publication.provider, externalId, correlationId);
  const found = remote && Object.keys(remote).length > 0;
  const publicUrl = extractPublicUrl(publication.provider, remote, externalId);
  await admin
    .from("property_provider_publications")
    .update({
      external_property_id: externalId,
      ...(publicUrl ? { external_public_url: publicUrl } : {}),
      status: found ? "published" : "out_of_sync",
      last_verified_at: new Date().toISOString(),
      last_error_message: found ? null : "Divergência detectada na reconciliação.",
    })
    .eq("id", publication.id);
  // Reconciliação é read-only na direção externa: o cadastro local nunca é sobrescrito.
  return { status: found ? ("published" as const) : ("out_of_sync" as const), externalId };
}

/**
 * Trava de segurança (10/09/2026): enquanto `imobi_update_sync_paused` estiver
 * ligada, nenhuma alteração é enviada aos sites. Motivo: as atualizações em massa
 * de 08–09/09 coincidiram com o sumiço do proprietário vinculado no painel do
 * Imobi. Publicação, despublicação e exclusão continuam liberadas.
 */
async function isUpdateSyncPaused(admin: Admin): Promise<boolean> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "imobi_update_sync_paused")
    .maybeSingle();
  const value = (data?.value ?? null) as { paused?: boolean } | null;
  return value?.paused === true;
}

export async function runSyncWorker(
  admin: Admin,
  options: { limit?: number; workerId?: string } = {},
) {
  const workerId = options.workerId ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
  const updatesPaused = await isUpdateSyncPaused(admin);
  const { data: jobs, error } = await admin.rpc("property_sync_claim_jobs", {
    _worker: workerId,
    _limit: options.limit ?? 5,
    _lease_seconds: 180,
  });
  if (error) throw new Error(error.message);

  const claimed = (jobs ?? []) as unknown as SyncJob[];
  const results: Array<Record<string, unknown>> = [];

  for (const job of claimed) {
    const started = Date.now();
    try {
      const outcome = await processJob(admin, job);
      await admin
        .from("property_sync_jobs")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          locked_at: null,
          lock_expires_at: null,
          locked_by: null,
          last_error_category: null,
          last_error_message: null,
        })
        .eq("id", job.id);
      await logAttempt(admin, job, {
        step: job.action,
        ok: true,
        durationMs: Date.now() - started,
      });
      results.push({ jobId: job.id, provider: job.provider, ...outcome });
    } catch (error) {
      const normalized = toImobiError(error);
      const canRetry = normalized.retryable && job.attempts < job.max_attempts;
      await admin
        .from("property_sync_jobs")
        .update({
          status: canRetry ? "retry" : "failed",
          next_run_at: new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString(),
          finished_at: canRetry ? null : new Date().toISOString(),
          locked_at: null,
          lock_expires_at: null,
          locked_by: null,
          last_http_status: normalized.httpStatus,
          last_error_category: normalized.category,
          last_error_message: normalized.message,
        })
        .eq("id", job.id);
      await admin
        .from("property_provider_publications")
        .update({
          status: "error",
          last_error_category: normalized.category,
          last_error_message: normalized.message,
        })
        .eq("property_id", job.property_id)
        .eq("provider", job.provider);
      await logAttempt(admin, job, {
        step: job.action,
        ok: false,
        durationMs: Date.now() - started,
        httpStatus: normalized.httpStatus,
        errorCategory: normalized.category,
        errorMessage: normalized.message,
      });
      results.push({ jobId: job.id, provider: job.provider, error: normalized.category });
    }
  }

  return { claimed: claimed.length, results };
}
