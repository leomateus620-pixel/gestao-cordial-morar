/**
 * Worker de sincronização de imóveis com a ImobiBrasil. Server-only.
 *
 * Fluxo multi-etapas com estado `partial`: cadastro → características → imagens →
 * verificação remota. Nada é marcado como `published` sem confirmação por GET.
 */

import { confirmedLocalFieldsAfterSend, confirmedSnapshotAfterSend } from "./confirm-snapshot";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImobiApiError, sanitizeMessage, toImobiError } from "./errors";
import { extractExternalId, imobiRequest, hasProviderToken } from "./client.server";
import { resolveProviderCodes } from "./catalogs.server";
import {
  buildUnpublishPatch,
  buildUpdatePatch,
  hasEffectivePatch,
  type UpdatePatch,
} from "./update-contract";
import { extractPublicUrl } from "./public-url";
import {
  diffCharacteristics,
  nextConfirmedSet,
  verifyFields,
} from "./characteristics-diff";

import {
  buildExternalReference,
  hashPayload,
  serializeProperty,
  type LocalPropertyForSync,
} from "./serializers";
import { providerLabel, type ImobiProvider } from "./providers";
import {
  PAUSE_DEFER_SECONDS,
  claimActionsFor,
  claimLimitFor,
  isWriteBlockedByPause,
  leaseSecondsFor,
  type QueueAction,
  type WorkerKind,
} from "./queue-policy";
import {
  isKnownLink,
  remoteToPayloadSnapshot,
  sameValue,
  type PayloadSnapshot,
} from "./payload-diff";
import { providerExternalCode } from "./provider-code";
import { sha256 } from "./import.server";
import { normalizeRemoteProperty, toPropertyRow } from "./import-normalizers";
import {
  canCreateAfterAmbiguity,
  classifyRemoteLookup,
  describeInconclusive,
  extractRemoteList,
  matchByReference,
  normalizeCadastralAction,
  type ReferenceMatch,
  type RemoteListRead,
  type RemoteLookupResult,
} from "./reference-lookup";



type Admin = SupabaseClient;

export type SyncJob = {
  id: string;
  property_id: string;
  provider: ImobiProvider;
  action: "publish" | "update" | "unpublish" | "delete" | "reconcile" | "media_sync";
  requested_revision: number;
  correlation_id: string;
  attempts: number;
  max_attempts: number;
  publication_intent_revision?: number | null;
  /** Identificador exclusivo desta execução: só quem o tem pode concluir o job. */
  lease_token?: string | null;
  /** Campos locais que o usuário realmente alterou (contrato de alteração). */
  changed_fields?: string[] | null;
};

/**
 * Conclui o trabalho SOMENTE se a posse ainda for desta execução. Um worker
 * antigo (lease expirado e job já reivindicado por outro) não finaliza nada.
 */
async function finishJob(
  admin: Admin,
  job: SyncJob,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const cleaned = {
    locked_at: null,
    lock_expires_at: null,
    locked_by: null,
    ...fields,
  };
  // Toda confirmação precisa da posse atual. Um claim antigo sem token volta
  // pelo watchdog; ele jamais pode finalizar o trabalho de outro executor.
  if (!job.lease_token) return false;
  const { data, error } = await admin.rpc("property_sync_finish_job", {
    _job_id: job.id,
    _lease_token: job.lease_token,
    _fields: cleaned,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Conclui um trabalho de FOTOS e agenda o acompanhamento na MESMA operação
 * (`property_media_finish_job`). Antes o agendamento acontecia com o job ainda
 * em `processing`: a alteração feita durante o envio ficava só marcada e nada a
 * executava.
 */
async function finishMediaJob(admin: Admin, job: SyncJob): Promise<boolean> {
  if (!job.lease_token) return false;
  const { data, error } = await admin.rpc("property_media_finish_job", {
    _job_id: job.id,
    _lease_token: job.lease_token,
    _fields: {
      status: "succeeded",
      finished_at: new Date().toISOString(),
      last_error_category: null,
      last_error_message: null,
    },
    _property_id: job.property_id,
    _provider: job.provider,
    _processed_revision: job.requested_revision,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as { owned?: boolean };
  return payload.owned !== false;
}

/** A rotina perdeu a posse do trabalho: nenhum efeito externo nem gravação pode seguir. */
export class LeaseLostError extends Error {
  constructor(jobId: string) {
    super(`Posse do trabalho ${jobId} perdida; outra execução assumiu.`);
    this.name = "LeaseLostError";
  }
}

/** Renova o lease. Devolve false quando a posse foi perdida ou não pôde ser comprovada. */
export async function renewJobLease(admin: Admin, job: SyncJob, seconds = 120): Promise<boolean> {
  if (!job.lease_token) return false;
  try {
    const { data, error } = await admin.rpc("property_sync_renew_lease", {
      _job_id: job.id,
      _lease_token: job.lease_token,
      _seconds: seconds,
    });
    if (error) return false;
    return data === true;
  } catch {
    // Sem confirmação de posse, parar é o seguro: o trabalho volta à fila.
    return false;
  }
}

/** Há envio cadastral mais novo (revisão maior) na fila para o mesmo imóvel e site? */
export async function isSupersededJob(admin: Admin, job: SyncJob): Promise<boolean> {
  const { data, error } = await admin
    .from("property_sync_jobs")
    .select("id")
    .eq("property_id", job.property_id)
    .eq("provider", job.provider)
    .eq("action", "update")
    .in("status", ["pending", "retry"])
    .gt("requested_revision", job.requested_revision ?? 0)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Confirma a posse antes de uma chamada externa; interrompe se foi perdida. */
export async function assertJobLease(admin: Admin, job: SyncJob, seconds = 120): Promise<void> {
  if (!(await renewJobLease(admin, job, seconds))) throw new LeaseLostError(job.id);
  const { data, error } = await admin
    .from("property_provider_publications")
    .select("desired_availability, publication_intent_revision")
    .eq("property_id", job.property_id)
    .eq("provider", job.provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ObsoleteIntentError(job.id);
  const desired = String(data.desired_availability ?? "visible");
  if (
    (job.publication_intent_revision != null &&
      Number(data.publication_intent_revision ?? 0) !== Number(job.publication_intent_revision)) ||
    (["publish", "update", "media_sync"].includes(job.action) && desired !== "visible") ||
    (job.action === "unpublish" && desired !== "hidden") ||
    (job.action === "delete" && desired !== "deleted")
  ) throw new ObsoleteIntentError(job.id);
  if (job.action === "media_sync") {
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("gallery_revision, archived_at")
      .eq("id", job.property_id)
      .single();
    if (propertyError) throw new Error(propertyError.message);
    if (property.archived_at || Number(property.gallery_revision) !== Number(job.requested_revision)) {
      throw new ObsoleteIntentError(job.id);
    }
  }
}


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
  const { error } = await admin.from("property_sync_attempts").insert({
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
  if (error) throw new Error(error.message);
}

function backoffSeconds(attempts: number): number {
  // Espera crescente com variação (evita que várias filas voltem juntas).
  const base = Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/**
 * Pausa das alterações: sinalizada como ESTADO RETOMÁVEL. O job volta para a
 * fila com nova data, nunca é cancelado — ao liberar, a intenção atual é
 * reprocessada sozinha.
 */
/**
 * Código obrigatório sem correspondência no catálogo do destino (tipo de imóvel,
 * cidade). Nada é adivinhado: a alteração fica PENDENTE no Gestão com mensagem
 * acionável e o trabalho volta para a fila — nunca é enviado pela metade.
 */
export class MappingPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingPendingError";
  }
}

export class PausedWriteError extends Error {
  constructor(public readonly action: QueueAction) {
    super("Envio de alterações aos sites está pausado. O pedido ficou na fila aguardando liberação.");
    this.name = "PausedWriteError";
  }
}

/**
 * Última barreira antes de QUALQUER escrita externa, já com a ação efetiva
 * resolvida (um `publish` de imóvel existente é alteração e também é barrado).
 */
/** Primeiro vínculo realmente conhecido. `0`, vazio ou ausente => nunca enviado. */
function firstKnownLink(...values: Array<string | null | undefined>): string | null {
  for (const value of values) if (isKnownLink(value)) return String(value).trim();
  return null;
}

function assertWriteAllowed(action: QueueAction, updatesPaused: boolean) {
  if (isWriteBlockedByPause(action, updatesPaused)) throw new PausedWriteError(action);
}

const LOOKUP_PER_PAGE = 50;
const LOOKUP_MAX_PAGES = 20;

/**
 * Procura a referência externa antes de qualquer criação — idempotência obrigatória.
 *
 * A paginação é percorrida até esgotar. Formato desconhecido, falha de consulta ou
 * paginação truncada devolvem `inconclusive`: nunca "não existe". Um parser cego
 * aqui significaria criar um segundo anúncio do mesmo imóvel.
 */
async function lookupByReference(
  provider: ImobiProvider,
  reference: string,
  correlationId: string,
): Promise<{ lookup: RemoteLookupResult; match: ReferenceMatch; items: number }> {
  const reads: RemoteListRead[] = [];
  let complete = false;
  let failed = false;

  for (let page = 1; page <= LOOKUP_MAX_PAGES; page += 1) {
    let response: Awaited<ReturnType<typeof imobiRequest>>;
    try {
      response = await imobiRequest(
        provider,
        `/imovel/lista?referencia=${encodeURIComponent(reference)}&page=${page}&per_page=${LOOKUP_PER_PAGE}`,
        { method: "GET", correlationId },
      );
    } catch {
      failed = true;
      break;
    }
    const read = extractRemoteList(response.data);
    reads.push(read);
    if (!read.recognized) break;
    if (read.items.length < LOOKUP_PER_PAGE) {
      complete = true;
      break;
    }
  }

  const items = reads.flatMap((read) => read.items);
  return {
    lookup: classifyRemoteLookup({ reads, reference, complete, failed }),
    match: matchByReference(items, reference),
    items: items.length,
  };
}

/** Resultado inconclusivo nunca autoriza criação: o trabalho volta para a fila. */
function inconclusiveError(reference: string, reason: string): ImobiApiError {
  return new ImobiApiError({
    message: `${describeInconclusive(reason)} A referência ${reference} não pôde ser confirmada; nenhuma criação foi feita.`,
    category: "protocol",
    ambiguous: true,
  });
}

/** Devolve a trava de criação. Nunca lança: falhar aqui não pode travar a fila. */
async function releaseCreateLock(admin: Admin, publicationId: string, worker: string | null) {
  if (!worker) return;
  try {
    await admin.rpc("property_publication_release_create_lock", {
      _publication_id: publicationId,
      _worker: worker,
    });
  } catch {
    // O lease expira sozinho.
  }
}

/** Grava o resultado da conferência remota na publicação (auditável na tela). */
async function recordRemoteMatch(
  admin: Admin,
  publicationId: string,
  match: ReferenceMatch,
  extra: Record<string, unknown> = {},
) {
  const { error } = await admin
    .from("property_provider_publications")
    .update({
      remote_match_count: match.count,
      remote_match_ids: match.ids,
      remote_match_checked_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", publicationId);
  if (error) throw new Error(error.message);
}

async function findRemoteByReference(
  provider: ImobiProvider,
  reference: string,
  correlationId: string,
): Promise<string | null> {
  const { lookup } = await lookupByReference(provider, reference, correlationId);
  // Uma lista incompleta ou com duplicatas pode ter um único item legível.
  // Isso não comprova a identidade nem autoriza associar o código remoto.
  return lookup.kind === "unique" ? lookup.externalId : null;
}

async function finishAvailabilityIfOwned(
  admin: Admin, job: SyncJob, publicationId: string,
  action: "unpublish" | "delete",
): Promise<void> {
  if (!job.lease_token) throw new LeaseLostError(job.id);
  const { data, error } = await admin.rpc(
    "property_publication_finish_availability_if_owned" as never,
    {
      _job_id: job.id, _lease_token: job.lease_token,
      _publication_id: publicationId, _action: action,
    } as never,
  );
  if (error) throw new Error(error.message);
  if (data !== true) throw new LeaseLostError(job.id);
}

async function verifyRemote(provider: ImobiProvider, externalId: string, correlationId: string) {
  const response = await imobiRequest(provider, `/imovel/dados/${encodeURIComponent(externalId)}`, {
    method: "GET",
    extraHeaders: { codigoImovel: externalId },
    correlationId,
  });
  return response.data as Record<string, unknown>;
}

function verifiedRemoteRecord(remote: Record<string, unknown>, reference: string) {
  const record = (remote["resultSet"] as Record<string, unknown> | undefined) ?? remote;
  const source = Array.isArray(record) ? ((record[0] ?? {}) as Record<string, unknown>) : record;
  const actual = String(source["referenciaImovel"] ?? source["referencia"] ?? "").trim();
  if (!actual || actual.toUpperCase() !== reference.toUpperCase()) {
    throw new ImobiApiError({
      message: "A leitura do site não confirmou a identidade do anúncio; nenhuma alteração foi feita.",
      category: "protocol",
      ambiguous: true,
    });
  }
  return source;
}

async function observeVisibility(
  provider: ImobiProvider,
  externalId: string,
  reference: string,
  correlationId: string,
): Promise<"visible" | "hidden"> {
  const record = verifiedRemoteRecord(await verifyRemote(provider, externalId, correlationId), reference);
  const raw = record["exibirImovel"];
  if (raw === true || ["sim", "s", "1", "true"].includes(String(raw).toLowerCase())) return "visible";
  if (raw === false || ["nao", "não", "n", "0", "false"].includes(String(raw).toLowerCase())) return "hidden";
  throw new ImobiApiError({
    message: "O site não informou a visibilidade do anúncio; ocultação ainda não confirmada.",
    category: "protocol",
    ambiguous: true,
  });
}

async function observeDeletion(
  provider: ImobiProvider,
  externalId: string,
  reference: string,
  correlationId: string,
): Promise<"present" | "absent"> {
  try {
    verifiedRemoteRecord(await verifyRemote(provider, externalId, correlationId), reference);
    return "present";
  } catch (error) {
    if (!(error instanceof ImobiApiError) || error.httpStatus !== 404) throw error;
  }
  const { lookup } = await lookupByReference(provider, reference, correlationId);
  if (lookup.kind === "absent") return "absent";
  if (lookup.kind === "inconclusive") throw inconclusiveError(reference, lookup.reason);
  throw new ImobiApiError({
    message: "A lista ainda contém anúncio com esta referência; exclusão não confirmada.",
    category: "protocol",
    ambiguous: true,
  });
}

/**
 * Vínculos internos do imóvel no site (proprietário, corretor, usuário adicional).
 *
 * O suporte ImobiBrasil confirmou em 11/09/2026 que `POST /imovel/alterar` zera todo
 * campo ausente no corpo. Por isso toda alteração passa a ler esses códigos antes de
 * enviar e devolvê-los junto — e o Gestão guarda uma cópia para nunca depender só do site.
 */
export type RemotePersonLinks = {
  codigoProprietario?: string;
  codigoCorretor?: string;
  codigoUsuarioAdicional?: string;
};

function pickPersonLinks(remote: Record<string, unknown>): RemotePersonLinks {
  const record =
    (remote?.["resultSet"] as Record<string, unknown> | undefined) ??
    (remote?.["data"] as Record<string, unknown> | undefined) ??
    remote ??
    {};
  const source = Array.isArray(record) ? ((record[0] ?? {}) as Record<string, unknown>) : record;
  const read = (key: string) => {
    const raw = String(source[key] ?? "").trim();
    return raw && raw !== "0" ? raw : undefined;
  };
  const links: RemotePersonLinks = {};
  const owner = read("codigoProprietario");
  const broker = read("codigoCorretor");
  const extra = read("codigoUsuarioAdicional");
  if (owner) links.codigoProprietario = owner;
  if (broker) links.codigoCorretor = broker;
  if (extra) links.codigoUsuarioAdicional = extra;
  return links;
}

async function loadPersonLinks(
  admin: Admin,
  provider: ImobiProvider,
  externalId: string,
  publication: Record<string, unknown>,
  correlationId: string,
): Promise<{ links: RemotePersonLinks; remote: Record<string, unknown> | null }> {
  const stored: RemotePersonLinks = {};
  const storedOwner = String(publication["remote_codigo_proprietario"] ?? "").trim();
  const storedBroker = String(publication["remote_codigo_corretor"] ?? "").trim();
  const storedExtra = String(publication["remote_codigo_usuario_adicional"] ?? "").trim();
  if (storedOwner) stored.codigoProprietario = storedOwner;
  if (storedBroker) stored.codigoCorretor = storedBroker;
  if (storedExtra) stored.codigoUsuarioAdicional = storedExtra;

  let remoteLinks: RemotePersonLinks = {};
  let remoteState: Record<string, unknown> | null = null;
  try {
    remoteState = await verifyRemote(provider, externalId, correlationId);
    remoteLinks = pickPersonLinks(remoteState);
  } catch {
    // Falha de leitura nunca trava o envio: seguimos com a cópia local.
  }

  const merged: RemotePersonLinks = { ...stored, ...remoteLinks };

  if (Object.keys(remoteLinks).length) {
    await admin
      .from("property_provider_publications")
      .update({
        remote_codigo_proprietario: merged.codigoProprietario ?? null,
        remote_codigo_corretor: merged.codigoCorretor ?? null,
        remote_codigo_usuario_adicional: merged.codigoUsuarioAdicional ?? null,
        remote_links_synced_at: new Date().toISOString(),
      })
      .eq("id", publication["id"] as string);
  }

  return { links: merged, remote: remoteState };
}

/** Traz nome/telefone/e-mail do proprietário do site para a ficha interna, só em campos vazios. */
async function hydrateOwnerContact(
  admin: Admin,
  provider: ImobiProvider,
  propertyId: string,
  property: Record<string, unknown>,
  ownerCode: string | undefined,
  correlationId: string,
) {
  if (!ownerCode) return;
  const hasAll =
    String(property["proprietario_nome"] ?? "").trim() &&
    String(property["proprietario_telefone"] ?? "").trim();
  if (hasAll) return;
  try {
    const { fetchPersonDetail } = await import("./read.server");
    const person = await fetchPersonDetail(provider, ownerCode, correlationId);
    const nome = String(person["nome"] ?? person["razaoSocial"] ?? person["nomeFantasia"] ?? "").trim();
    const telefone = String(person["telefone1"] ?? person["telefone2"] ?? "").trim();
    const email = String(person["email"] ?? "").trim();
    const patch: Record<string, string> = {};
    if (nome && !String(property["proprietario_nome"] ?? "").trim()) patch["proprietario_nome"] = nome;
    if (telefone && !String(property["proprietario_telefone"] ?? "").trim())
      patch["proprietario_telefone"] = telefone;
    if (email && !String(property["proprietario_email"] ?? "").trim()) patch["proprietario_email"] = email;
    if (!Object.keys(patch).length) return;
    await admin.from("properties").update(patch).eq("id", propertyId);
    Object.assign(property, patch);
  } catch {
    // Contato é complementar: qualquer falha aqui não interrompe a publicação.
  }
}

/**
 * Características por DIFERENÇA: insere as novas, mantém as existentes e remove
 * as retiradas usando o endpoint que desassocia a característica DAQUELE imóvel
 * (`/imovel/{codigo}/caracteristica/excluir/{codigo}`). O endpoint que apaga a
 * característica do catálogo global NUNCA é usado.
 *
 * Remoção só alcança o que o Gestão confirmou antes: associações feitas no
 * painel do site não são tocadas. Falha de permissão, validação ou limite marca
 * a etapa como INCOMPLETA — nunca como sucesso.
 */
async function syncCharacteristics(
  admin: Admin,
  job: SyncJob,
  externalId: string,
  desiredCodes: string[],
  publication: { id: string; characteristic_codes?: unknown },
) {
  const confirmed = Array.isArray(publication.characteristic_codes)
    ? (publication.characteristic_codes as unknown[])
    : [];
  const { toInsert, toRemove } = diffCharacteristics(confirmed, desiredCodes);
  if (!toInsert.length && !toRemove.length) {
    return { inserted: [] as string[], removed: [] as string[], incomplete: false };
  }

  const inserted: string[] = [];
  const removed: string[] = [];
  let incomplete = false;

  const call = async (path: string, code: string, step: string) => {
    try {
      await assertJobLease(admin, job); // posse confirmada antes do efeito externo
      await imobiRequest(job.provider, path, {
        method: "POST",
        extraHeaders: { codigoImovel: externalId, codigoCaracteristica: code },
        correlationId: job.correlation_id,
      });
      return true;
    } catch (error) {
      // Posse perdida interrompe tudo: nenhum outro efeito externo.
      if (error instanceof LeaseLostError) throw error;
      const normalized = toImobiError(error);
      await logAttempt(admin, job, {
        step,
        ok: false,
        errorCategory: normalized.category,
        errorMessage: `${step} ${code}: ${normalized.message}`,
      });
      return false;
    }
  };

  for (const code of toInsert) {
    const ok = await call(
      `/imovel/${encodeURIComponent(externalId)}/caracteristica/inserir/${encodeURIComponent(code)}`,
      code,
      "characteristic_insert",
    );
    if (ok) inserted.push(code);
    else incomplete = true;
  }

  for (const code of toRemove) {
    const ok = await call(
      `/imovel/${encodeURIComponent(externalId)}/caracteristica/excluir/${encodeURIComponent(code)}`,
      code,
      "characteristic_remove",
    );
    if (ok) removed.push(code);
    else incomplete = true;
  }

  // Conjunto confirmado = o que ficou de fato associado por decisão do Gestão.
  const nextConfirmed = nextConfirmedSet(confirmed, inserted, removed);
  await admin
    .from("property_provider_publications")
    .update({
      characteristic_codes: nextConfirmed as never,
      characteristic_synced_at: new Date().toISOString(),
      characteristic_sync_incomplete: incomplete,
    })
    .eq("id", publication.id);

  return { inserted, removed, incomplete };
}

/**
 * Fotos NÃO fazem parte do job cadastral (correção 18/09/2026). O publish/update
 * apenas enfileira `media_sync`, que é o único caminho que fala com os recursos
 * de imagem do site. Assim uma etapa lenta de mídia nunca segura — nem derruba —
 * a publicação cadastral e os jobs seguintes da fila.
 */
async function queueMediaAfterCadastral(admin: Admin, job: SyncJob) {
  try {
    const { queueMediaSync } = await import("./media-sync.server");
    const queued = await queueMediaSync(admin, job.property_id, { providers: [job.provider] });
    await logAttempt(admin, job, {
      step: "media_enqueued",
      ok: true,
      errorMessage: `media_sync enfileirado (galeria v${queued.galleryRevision}).`,
    });
    return queued;
  } catch (error) {
    // O kick/enfileiramento é opcional apenas quando a intenção de galeria
    // já está comprovadamente durável na publicação. Sem essa prova o job
    // cadastral permanece pendente, e nunca finge entrega de mídia.
    await logAttempt(admin, job, {
      step: "media_enqueued",
      ok: false,
      errorCategory: toImobiError(error).category,
      errorMessage: toImobiError(error).message,
    });
    const [{ data: property, error: propertyError }, { data: publication, error: publicationError }] =
      await Promise.all([
        admin.from("properties").select("gallery_revision").eq("id", job.property_id).single(),
        admin.from("property_provider_publications")
          .select("media_dirty_revision")
          .eq("property_id", job.property_id)
          .eq("provider", job.provider)
          .single(),
      ]);
    if (propertyError || publicationError ||
      Number(publication?.media_dirty_revision ?? -1) < Number(property?.gallery_revision ?? 0)) {
      throw error;
    }
    return { enqueued: [] as string[], galleryRevision: Number(property.gallery_revision), recoveredByOutbox: true };
  }
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
  const { data, error: lookupError } = await admin
    .from("property_provider_publications")
    .select("*")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
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


export async function processJob(
  admin: Admin,
  job: SyncJob,
  options: { updatesPaused?: boolean } = {},
) {
  const updatesPaused = options.updatesPaused === true;
  // Mídia é um caminho totalmente separado do cadastro: sai daqui antes de
  // qualquer leitura/gravação cadastral (código do provedor, catálogos,
  // vínculos de proprietário/corretor) e nunca chama `/imovel/alterar`.
  if (job.action === "media_sync") {
    if (!hasProviderToken(job.provider)) {
      throw new ImobiApiError({
        message: `Token do provedor ${job.provider} não configurado.`,
        category: "config",
      });
    }
    const { syncPropertyMedia } = await import("./media-sync.server");
    // Renovação de reserva entre passos: galeria grande é enviada em ciclos sem
    // perder a posse do trabalho.
    return syncPropertyMedia(admin, job, {
      onProgress: async () => {
        await assertJobLease(admin, job, 180);
      },
    });
  }

  const property = await loadProperty(admin, job.property_id);
  if (
    (job.action === "publish" || job.action === "update") &&
    Number(property.revision ?? 1) > Number(job.requested_revision ?? 0)
  ) throw new ObsoleteIntentError(job.id);
  // Um imóvel publicado numa imobiliária sem código próprio recebe agora um número
  // real da sequência daquela imobiliária — nunca mais a referência técnica `GC-…`.
  const providerCode = await ensureProviderCode(admin, job.property_id, job.provider, property);
  const publication = await ensurePublication(admin, job.property_id, job.provider, providerCode);
  // Enquanto o imóvel não existe no site, a referência acompanha o código do provedor.
  let reference = publication.external_reference ?? buildExternalReference(job.property_id);
  if (providerCode && reference !== providerCode &&
      !publication.external_property_id && !publication.create_state &&
      !publication.last_synced_at) {
    reference = providerCode;
    await admin
      .from("property_provider_publications")
      .update({ external_reference: providerCode })
      .eq("id", publication.id);
  }

  // Referência comercial é POR CONTA: o número da Cordial nunca vale na Morar.
  // Guardamos o código daquela imobiliária no próprio vínculo do destino.
  if (providerCode && publication["commercial_reference"] !== providerCode) {
    await admin
      .from("property_provider_publications")
      .update({ commercial_reference: providerCode })
      .eq("id", publication.id);
  }



  if (!hasProviderToken(job.provider)) {
    throw new ImobiApiError({
      message: `Token do provedor ${job.provider} não configurado.`,
      category: "config",
    });
  }

  if ((job.action === "unpublish" || job.action === "delete") &&
      !publication.external_property_id &&
      (publication.create_state || publication.last_synced_at)) {
    // Um POST de criação pode ter sido aceito sem resposta antes da decisão de
    // retirar. Sem esta leitura, a ausência de ID local deixaria o anúncio no site.
    await assertJobLease(admin, job);
    const { lookup, match } = await lookupByReference(job.provider, reference, job.correlation_id);
    if (lookup.kind === "inconclusive") throw inconclusiveError(reference, lookup.reason);
    if (lookup.kind === "duplicate") {
      await recordRemoteMatch(admin, publication.id, match, {
        create_state: "remote_duplicate_detected", status: "out_of_sync",
        last_error_category: "business",
        last_error_message: "Há mais de um anúncio com esta referência; retirada automática bloqueada.",
      });
      throw new ImobiApiError({ message: "Duplicidade remota exige decisão administrativa.", category: "business" });
    }
    if (lookup.kind === "unique") {
      const { data: attached, error: attachError } = await admin
        .from("property_provider_publications")
        .update({ external_property_id: lookup.externalId, create_state: null,
          create_absent_checks: 0, remote_match_count: 1, remote_match_ids: [lookup.externalId] })
        .eq("id", publication.id)
        .eq("publication_intent_revision", job.publication_intent_revision ?? 0)
        .select("id").maybeSingle();
      if (attachError) throw new Error(attachError.message);
      if (!attached) throw new ObsoleteIntentError(job.id);
      publication.external_property_id = lookup.externalId;
    } else {
      const absentChecks = Number(publication.create_absent_checks ?? 0) + 1;
      const { data: recorded, error: recordError } = await admin
        .from("property_provider_publications")
        .update({ create_state: "awaiting_create_reconcile",
          create_absent_checks: absentChecks, remote_match_checked_at: new Date().toISOString() })
        .eq("id", publication.id)
        .eq("publication_intent_revision", job.publication_intent_revision ?? 0)
        .select("id").maybeSingle();
      if (recordError) throw new Error(recordError.message);
      if (!recorded) throw new ObsoleteIntentError(job.id);
      if (!canCreateAfterAmbiguity({ create_state: "awaiting_create_reconcile", create_absent_checks: absentChecks })) {
        throw new ImobiApiError({
          message: "Criação anterior sem resposta: aguardando novas leituras antes de retirar o cadastro.",
          category: "protocol", ambiguous: true,
        });
      }
    }
  }

  const { error: syncingError } = await admin
    .from("property_provider_publications")
    .update({ status: "syncing", last_error_message: null })
    .eq("id", publication.id)
    .eq("publication_intent_revision", job.publication_intent_revision ?? 0);
  if (syncingError) throw new Error(syncingError.message);

  const resolution = await resolveProviderCodes(admin, job.provider, {
    ...property,
    referencia: reference,
  });

  if (job.action === "unpublish") {
    // Arquivamento pedido pelo usuário: conclui assim que todos os sites confirmam.
    const { finalizePendingArchive } = await import("@/lib/imoveis/purge.server");
    if (!publication.external_property_id) {
      await assertJobLease(admin, job);
      await finishAvailabilityIfOwned(admin, job, publication.id, "unpublish");
      await finalizePendingArchive(admin, job.property_id);
      return { status: "unpublished" as const };
    }
    // Retirada do site é ALTERAÇÃO MÍNIMA: só o campo de exibição e os
    // obrigatórios do contrato. Nada mais é reenviado — omitir preserva.
    const full = serializeProperty(
      { ...property, referencia: reference, exibir_imovel: false },
      resolution.codes,
      { mode: "update" },
    );
    const payload = buildUnpublishPatch(full);
    assertWriteAllowed("unpublish", updatesPaused);
    const before = await observeVisibility(
      job.provider, publication.external_property_id, reference, job.correlation_id,
    );
    if (before !== "hidden") {
      await assertJobLease(admin, job);
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
    }
    if (await observeVisibility(
      job.provider, publication.external_property_id, reference, job.correlation_id,
    ) !== "hidden") {
      throw new ImobiApiError({
        message: "O site ainda não confirmou que o anúncio foi ocultado.",
        category: "protocol",
        ambiguous: true,
      });
    }
    await assertJobLease(admin, job);
    await finishAvailabilityIfOwned(admin, job, publication.id, "unpublish");
    await finalizePendingArchive(admin, job.property_id);
    return { status: "unpublished" as const };
  }

  if (job.action === "delete") {
    if (publication.external_property_id) {
      const before = await observeDeletion(
        job.provider, publication.external_property_id, reference, job.correlation_id,
      );
      if (before === "present") {
        await assertJobLease(admin, job);
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
      if (await observeDeletion(
        job.provider, publication.external_property_id, reference, job.correlation_id,
      ) !== "absent") {
        throw new ImobiApiError({
          message: "A exclusão ainda não foi confirmada pelo site.",
          category: "protocol",
          ambiguous: true,
        });
      }
    }
    await assertJobLease(admin, job);
    await finishAvailabilityIfOwned(admin, job, publication.id, "delete");
    // Exclusão pedida pelo usuário: apaga o cadastro assim que todos os sites confirmarem.
    const { finalizePendingRemoval } = await import("@/lib/imoveis/purge.server");
    await finalizePendingRemoval(admin, job.property_id);
    return { status: "deleted" as const };
  }


  if (job.action === "reconcile") {
    return reconcilePublication(admin, publication, job.correlation_id);
  }

  // ---- publish / update ----
  // Campos realmente tocados nesta edição: o claim não os devolve, então são
  // lidos do próprio trabalho. Sem a lista, a alteração cai na diferença contra
  // o último envio confirmado e nunca limpa nada por conta.
  if (job.changed_fields === undefined) {
    const { data: jobRow } = await admin
      .from("property_sync_jobs")
      .select("changed_fields")
      .eq("id", job.id)
      .maybeSingle();
    job.changed_fields = (jobRow?.changed_fields as string[] | null) ?? null;
  }

  // Códigos obrigatórios do contrato: nada é adivinhado. Sem correspondência no
  // catálogo DAQUELE destino, a alteração fica pendente com mensagem acionável.
  if (!resolution.codes.codigoTipoImovel) {
    throw new MappingPendingError(
      `O tipo "${property.tipo ?? "(não informado)"}" não tem correspondência no catálogo da ${providerLabel(job.provider)}. Escolha o tipo equivalente para que a alteração possa ser enviada.`,
    );
  }
  const ambiguousPerson = resolution.ambiguous.filter(
    (item) => item.domain === "broker" || item.domain === "owner",
  );
  if (ambiguousPerson.length) {
    await logAttempt(admin, job, {
      step: "mapping",
      ok: false,
      errorCategory: "mapping",
      errorMessage: `Homônimo em ${ambiguousPerson.map((item) => `${item.domain}:${item.value}`).join(", ")} — vínculo mantido como desconhecido.`,
    });
  }

  // Imóvel que já existe no site NUNCA volta ao caminho de criação: `publish`
  // vira alteração; sem ID guardado mas com histórico publicado, vira reconciliação.
  const effectiveAction = normalizeCadastralAction(
    job.action as "publish" | "update",
    publication as { external_property_id?: string | null; status?: string | null; last_synced_at?: string | null },
  );
  if (effectiveAction === "reconcile") {
    const observed = await reconcilePublication(admin, publication, job.correlation_id);
    // A referência recupera a identidade; ela não confirma os campos desta
    // revisão. Com ID único, prosseguimos no caminho normal de alteração.
    if (!observed.externalId || observed.status === "out_of_sync") return observed;
    publication.external_property_id = observed.externalId;
  }

  let externalId = publication.external_property_id as string | null;
  let createLockWorker: string | null = null;

  // Resultado ambíguo anterior ou primeira publicação: single-flight + leitura
  // remota obrigatória antes de qualquer criação.
  if (!externalId) {
    // O token muda em toda reivindicação. O job-id é reutilizado após lease
    // vencido e permitiria dois executores assumirem a mesma trava de criação.
    if (!job.lease_token) throw new LeaseLostError(job.id);
    const workerTag = job.lease_token;
    const { data: lockData, error: lockError } = await admin.rpc(
      "property_publication_acquire_create_lock",
      { _publication_id: publication.id, _worker: workerTag, _lease_seconds: 180 },
    );
    if (lockError) throw new Error(lockError.message);
    const lock = (lockData ?? {}) as {
      acquired?: boolean;
      publication?: Record<string, unknown> | null;
    };
    const fresh = (lock.publication ?? publication) as Record<string, unknown>;
    if (!lock.acquired) {
      throw new ImobiApiError({
        message: "Outra execução já está criando este imóvel no site. Nova tentativa em seguida.",
        category: "server",
      });
    }
    createLockWorker = workerTag;

    // Estado relido sob a trava: outro worker pode ter acabado de gravar o ID.
    externalId = (fresh["external_property_id"] as string | null) ?? null;

    if (!externalId) {
      const { lookup, match } = await lookupByReference(job.provider, reference, job.correlation_id);

      if (lookup.kind === "inconclusive") {
        // Leitura inconclusiva NUNCA autoriza criação: o trabalho volta à fila.
        await admin
          .from("property_provider_publications")
          .update({
            create_state: "awaiting_create_reconcile",
            remote_match_checked_at: new Date().toISOString(),
            last_error_category: "protocol",
            last_error_message: describeInconclusive(lookup.reason),
          })
          .eq("id", publication.id);
        await releaseCreateLock(admin, publication.id, createLockWorker);
        throw inconclusiveError(reference, lookup.reason);
      }

      if (lookup.kind === "duplicate") {
        await recordRemoteMatch(admin, publication.id, match, {
          create_state: "remote_duplicate_detected",
          status: "error",
          last_error_category: "business",
          last_error_message: `O site tem ${match.count} anúncios com a referência ${reference} (${match.ids.join(", ")}). Criação bloqueada até a duplicidade ser resolvida.`,
        });
        await releaseCreateLock(admin, publication.id, createLockWorker);
        throw new ImobiApiError({
          message: `Duplicidade remota detectada na referência ${reference}: ${match.ids.join(", ")}. Nenhum imóvel foi criado.`,
          category: "business",
        });
      }

      if (lookup.kind === "unique") {
        externalId = lookup.externalId;
        await recordRemoteMatch(admin, publication.id, match, {
          external_property_id: externalId,
          create_state: null,
          create_absent_checks: 0,
        });
      } else {
        // Ausência COMPROVADA (paginação esgotada): só cria se não houver
        // criação ambígua pendente sem confirmação.
        const absentChecks = Number(fresh["create_absent_checks"] ?? 0) + 1;
        await recordRemoteMatch(admin, publication.id, match, {
          create_absent_checks: absentChecks,
        });
        if (!canCreateAfterAmbiguity({
          create_state: (fresh["create_state"] as string | null) ?? null,
          create_absent_checks: absentChecks,
        })) {
          await releaseCreateLock(admin, publication.id, createLockWorker);
          throw new ImobiApiError({
            message:
              "Criação anterior sem resposta confirmada: aguardando novas leituras do site antes de tentar criar de novo.",
            category: "server",
          });
        }
      }
    }
  }

  const mode: "insert" | "update" = externalId ? "update" : "insert";
  // Leitura do estado remoto antes de alterar: serve para (a) conhecer os
  // vínculos que o site já tem e (b) montar o ponto de partida do imóvel antigo
  // que ainda não tem snapshot local. Vínculo nunca é reenviado por padrão:
  // omitir preserva (contrato de alteração parcial).
  const remoteBefore = externalId
    ? await loadPersonLinks(admin, job.provider, externalId, publication, job.correlation_id)
    : { links: {} as RemotePersonLinks, remote: null };
  const links = remoteBefore.links;
  await hydrateOwnerContact(
    admin,
    job.provider,
    job.property_id,
    property as unknown as Record<string, unknown>,
    links.codigoProprietario,
    job.correlation_id,
  );
  // Na criação os vínculos vão no corpo (o imóvel ainda não existe no site).
  // Na alteração eles ficam de fora: proprietário, corretor e usuário adicional
  // só mudam por pedido explícito, e desconhecido nunca vira zero.
  const fullPayload = serializeProperty(
    { ...property, referencia: reference },
    mode === "insert"
      ? {
          ...resolution.codes,
          codigoProprietario: firstKnownLink(
            resolution.codes.codigoProprietario,
            links.codigoProprietario,
          ),
          codigoCorretor: firstKnownLink(resolution.codes.codigoCorretor, links.codigoCorretor),
          codigoUsuarioAdicional: firstKnownLink(
            resolution.codes.codigoUsuarioAdicional,
            links.codigoUsuarioAdicional,
          ),
        }
      : { ...resolution.codes, codigoProprietario: null, codigoCorretor: null, codigoUsuarioAdicional: null },
    { mode },
  );

  let payload: Record<string, unknown> = fullPayload;
  let snapshotBase: PayloadSnapshot | null = null;
  let sentKeys: string[] = [];
  let changedPayloadKeys: string[] = [];

  if (externalId) {
    const stored = (publication["last_payload_snapshot"] ?? null) as PayloadSnapshot | null;
    snapshotBase =
      stored && Object.keys(stored).length
        ? stored
        : remoteBefore.remote
          ? remoteToPayloadSnapshot(remoteBefore.remote)
          : null;
    if (!stored && !remoteBefore.remote) {
      // Sem snapshot local e sem leitura do site: não há como saber o que mudou.
      // Preferimos não escrever nada a arriscar sobrescrever o site.
      throw new ImobiApiError({
        message:
          "Não foi possível ler o imóvel no site para comparar os campos. Nenhuma alteração foi enviada.",
        category: "network",
      });
    }
    // A exibição no site é verdade observável: quando a leitura mostra o anúncio
    // oculto e o Gestão o quer visível (ou o contrário), a comparação usa o
    // estado REAL do site. Sem isso, um anúncio retirado e depois republicado
    // ficaria escondido para sempre, porque o retrato local diria "sim".
    const remoteExibir = remoteBefore.remote
      ? ((remoteBefore.remote as Record<string, unknown>)["exibirImovel"] ?? null)
      : null;
    if (snapshotBase && typeof remoteExibir === "boolean") {
      snapshotBase = { ...snapshotBase, exibirImovel: remoteExibir ? "sim" : "nao" };
    }
    // Contrato de ALTERAÇÃO: conjunto explícito de mudanças, não cópia do
    // formulário. Com a lista de campos tocados, limpeza intencional viaja vazia
    // e campo intocado nem entra no corpo.
    const wantsVisibilityFix =
      typeof remoteExibir === "boolean" &&
      remoteExibir !== ((property.exibir_imovel ?? true) as boolean);
    const changedFields = job.changed_fields ?? null;
    // Campos que o envio anterior não conseguiu confirmar continuam pendentes.
    const previousVerification = (publication["last_field_verification"] ?? null) as {
      divergent?: string[];
    } | null;
    const pendingKeys = Array.isArray(previousVerification?.divergent)
      ? previousVerification!.divergent!
      : [];
    const patch: UpdatePatch = buildUpdatePatch({
      full: fullPayload,
      snapshot: snapshotBase,
      pendingKeys,
      changedFields:
        changedFields && wantsVisibilityFix && !changedFields.includes("exibirImovel")
          ? [...changedFields, "exibirImovel"]
          : changedFields,
    });
    payload = patch.payload;
    sentKeys = Object.keys(patch.payload);
    changedPayloadKeys = patch.changedKeys;
    const minimal = patch;

    if (hasEffectivePatch(patch)) {
      assertWriteAllowed("update", updatesPaused);
      await assertJobLease(admin, job); // posse confirmada antes do efeito externo
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
      await logAttempt(admin, job, {
        step: "update",
        ok: true,
        httpStatus: response.httpStatus,
        errorMessage: `Alteração mínima: ${minimal.changedKeys.join(", ")}${
          patch.clearedKeys.length ? ` · limpeza explícita: ${patch.clearedKeys.join(", ")}` : ""
        }`,
      });
    } else {
      sentKeys = [];
      await logAttempt(admin, job, {
        step: "update",
        ok: true,
        errorMessage: "Nenhum campo mudou desde o último envio confirmado.",
      });
    }
  } else {
    let response: Awaited<ReturnType<typeof imobiRequest>>;
    try {
      assertWriteAllowed("publish", updatesPaused);
      await assertJobLease(admin, job); // posse confirmada antes do efeito externo
      const { data: prepared, error: prepareError } = await admin.rpc(
        "property_publication_prepare_create" as never,
        {
          _job_id: job.id, _lease_token: job.lease_token,
          _publication_id: publication.id, _worker: createLockWorker,
        } as never,
      );
      if (prepareError) throw new Error(prepareError.message);
      if (prepared !== true) throw new LeaseLostError(job.id);
      // O checkpoint acima existe ANTES do POST. Se o processo morrer depois
      // do efeito remoto, a retomada só poderá ler por referência primeiro.
      response = await imobiRequest(job.provider, "/imovel/inserir", {
        method: "POST",
        json: fullPayload,
        allowRetry: false, // criação nunca sofre retry cego
        correlationId: job.correlation_id,
      });
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      const normalized = toImobiError(error);
      // Timeout / rede / 5xx: o site pode ter criado o imóvel e perdido a
      // resposta. Nunca repetimos o POST: marcamos para reconciliação por
      // referência (somente GET) nas próximas execuções.
      if (normalized.ambiguous || normalized.category === "network" || normalized.category === "server") {
        const { error: ambiguousError } = await admin
          .from("property_provider_publications")
          .update({
            create_state: "awaiting_create_reconcile",
            create_ambiguous_at: new Date().toISOString(),
            create_absent_checks: 0,
            last_error_category: normalized.category,
            last_error_message:
              "Criação sem confirmação do site. Nenhuma nova criação será tentada antes da conferência por referência.",
          })
          .eq("id", publication.id);
        if (ambiguousError) throw new Error(ambiguousError.message);
        await releaseCreateLock(admin, publication.id, createLockWorker);
        throw new ImobiApiError({
          message:
            "Criação sem resposta confirmada do site. O imóvel será conferido por referência antes de qualquer nova tentativa.",
          category: "server",
        });
      }
      await releaseCreateLock(admin, publication.id, createLockWorker);
      throw normalized;
    }
    await logAttempt(admin, job, { step: "insert", ok: true, httpStatus: response.httpStatus });
    // Inclusão: tudo que foi enviado precisa ser conferido na leitura.
    payload = fullPayload;
    sentKeys = Object.keys(fullPayload);
    changedPayloadKeys = sentKeys;
    externalId =
      extractExternalId(response.data) ??
      (await findRemoteByReference(job.provider, reference, job.correlation_id));
    if (!externalId) {
      const { error: ambiguousError } = await admin
        .from("property_provider_publications")
        .update({
          create_state: "awaiting_create_reconcile",
          create_ambiguous_at: new Date().toISOString(),
          create_absent_checks: 0,
        })
        .eq("id", publication.id);
      if (ambiguousError) throw new Error(ambiguousError.message);
      await releaseCreateLock(admin, publication.id, createLockWorker);
      throw new ImobiApiError({
        message: "O provedor não retornou o código do imóvel e a referência não foi localizada.",
        category: "protocol",
        ambiguous: true,
      });
    }
  }

  // Gravação do ID remoto: se ela falhar, o imóvel existe no site e o Gestão não
  // sabe. Isso vira pendência explícita de reconciliação — nunca nova criação.
  const { error: linkError } = await admin
    .from("property_provider_publications")
    .update({
      external_property_id: externalId,
      status: "partial",
      create_state: null,
      create_absent_checks: 0,
    })
    .eq("id", publication.id);
  if (linkError) {
    await admin
      .from("property_provider_publications")
      .update({
        create_state: "awaiting_create_reconcile",
        create_ambiguous_at: new Date().toISOString(),
        create_absent_checks: 0,
        last_error_category: "protocol",
        last_error_message: `Falha ao guardar o código ${externalId} recebido do site: ${sanitizeMessage(linkError.message)}`,
      })
      .eq("id", publication.id);
    await releaseCreateLock(admin, publication.id, createLockWorker);
    throw new ImobiApiError({
      message:
        "O site respondeu, mas o código do imóvel não pôde ser guardado. Será reconciliado por referência antes de qualquer nova tentativa.",
      category: "protocol",
      ambiguous: true,
    });
  }
  const createdNow = mode === "insert";
  await releaseCreateLock(admin, publication.id, createLockWorker);
  createLockWorker = null;

  // Conferência pós-criação: se o site passou a ter mais de um anúncio com a
  // mesma referência, o estado de duplicidade é registrado na hora (sem excluir
  // nada) e nenhuma nova criação será permitida.
  if (createdNow) {
    try {
      const { match } = await lookupByReference(job.provider, reference, job.correlation_id);
      await recordRemoteMatch(
        admin,
        publication.id,
        match,
        match.count > 1
          ? {
              create_state: "remote_duplicate_detected",
              last_error_category: "business",
              last_error_message: `O site tem ${match.count} anúncios com a referência ${reference} (${match.ids.join(", ")}).`,
            }
          : {},
      );
    } catch {
      // Conferência é complementar: falha aqui não invalida o cadastro criado.
    }
  }

  const characteristics = await syncCharacteristics(
    admin,
    job,
    externalId,
    resolution.characteristicCodes,
    publication as { id: string; characteristic_codes?: unknown },
  );

  // Verificação remota obrigatória antes de marcar como publicado.
  const remote = await verifyRemote(job.provider, externalId, job.correlation_id);
  const remoteSet = (remote?.["resultSet"] as Record<string, unknown> | undefined) ?? remote ?? {};
  const remoteReference = String(
    (remoteSet["referenciaImovel"] ??
      remoteSet["referencia"] ??
      remote?.["referencia"] ??
      "") as string,
  ).trim();
  // Leitura sem referência não comprova que é o mesmo imóvel.
  const verified = Boolean(remoteReference) && remoteReference.toUpperCase() === reference.toUpperCase();

  // Guarda a cópia mais recente dos vínculos que o site tem agora.
  const remoteLinksAfter = pickPersonLinks(remote);
  if (Object.keys(remoteLinksAfter).length) {
    await admin
      .from("property_provider_publications")
      .update({
        remote_codigo_proprietario: remoteLinksAfter.codigoProprietario ?? null,
        remote_codigo_corretor: remoteLinksAfter.codigoCorretor ?? null,
        remote_codigo_usuario_adicional: remoteLinksAfter.codigoUsuarioAdicional ?? null,
        remote_links_synced_at: new Date().toISOString(),
      })
      .eq("id", publication.id);
  }

  // Conferência campo a campo: resposta HTTP 200 e JSON não vazio não provam
  // nada. Cada campo enviado é comparado com a leitura do site; o que a leitura
  // não descreve fica explicitamente como "não verificável".
  const remoteSnapshot = remoteToPayloadSnapshot(remote);
  const sentPayload = Object.fromEntries(
    sentKeys.map((key) => [key, (payload as PayloadSnapshot)[key]]),
  );
  const fieldVerification = {
    checked_at: new Date().toISOString(),
    ...verifyFields(sentPayload, remoteSnapshot, sameValue),
  };
  if (sentKeys.length) {
    await logAttempt(admin, job, {
      step: "verify_fields",
      ok: fieldVerification.divergent.length === 0,
      errorCategory: fieldVerification.divergent.length ? "protocol" : null,
      errorMessage: `confirmados: ${fieldVerification.confirmed.join(", ") || "-"} · divergentes: ${fieldVerification.divergent.join(", ") || "-"} · não verificáveis: ${fieldVerification.unverifiable.join(", ") || "-"}`,
    });
  }

  // Cadastro concluído não depende das fotos: o estado da mídia vive em
  // `media_status` e é atualizado pelo caminho `media_sync`.
  // Características com falha parcial também deixam o cadastro "parcial": só as
  // que faltaram voltam no próximo envio (o conjunto confirmado não as inclui).
  const finalStatus =
    verified &&
    !fieldVerification.divergent.length &&
    !fieldVerification.unverifiable.length &&
    !characteristics.incomplete
      ? "published"
      : "partial";
  const publicUrl = extractPublicUrl(job.provider, remote, externalId);

  // Novo ponto de partida: o que o site tinha + o que acabou de ser gravado.
  // Assim a próxima alteração volta a enviar somente a diferença real.
  // Só o que o site CONFIRMOU entra na referência. Divergente e não
  // verificável ficam fora: a próxima comparação volta a tratá-los como
  // pendentes em vez de concluir que "nada mudou".
  const notConfirmed = new Set<string>([
    ...fieldVerification.divergent,
    ...fieldVerification.unverifiable,
  ]);
  const nextSnapshot = confirmedSnapshotAfterSend({
    mode,
    base: snapshotBase,
    full: fullPayload as PayloadSnapshot,
    sent: payload as PayloadSnapshot,
    sentKeys,
    notConfirmed,
  });
  const fullyConfirmed = finalStatus === "published";

  // Eco do próprio envio: a leitura pós-envio é gravada no MESMO espaço
  // normalizado da importação/reconciliação. Assim o conteúdo que o Gestão
  // acabou de publicar nunca é lido depois como "edição externa".
  const normalizedRemote = normalizeRemoteProperty(job.provider, externalId, remote as Record<string, unknown>);
  const remoteNormalizedHash = await sha256(JSON.stringify(normalizedRemote));
  const observedLocal = toPropertyRow(normalizedRemote) as Record<string, unknown>;
  const confirmedLocalSnapshot = confirmedLocalFieldsAfterSend({
    mode,
    base: (publication["confirmed_field_snapshot"] ?? null) as PayloadSnapshot | null,
    local: property as unknown as Record<string, unknown>,
    observed: observedLocal,
    confirmedPayloadKeys: fieldVerification.confirmed,
    changedPayloadKeys,
  });
  const nowIso = new Date().toISOString();

  // Uma edição posterior pode ter sido salva enquanto o HTTP estava em voo.
  // Registra o que esta leitura comprovou, mas a publicação continua pendente
  // para a revisão nova, que já está na outbox.
  await assertJobLease(admin, job);
  const { data: latestProperty, error: latestError } = await admin
    .from("properties")
    .select("revision")
    .eq("id", job.property_id)
    .single();
  if (latestError) throw new Error(latestError.message);
  const staleDesired = Number(latestProperty.revision ?? 1) > Number(job.requested_revision ?? 0);

  const { data: publicationOwned, error: publicationUpdateError } = await admin.rpc(
    "property_publication_update_if_owned" as never, {
      _job_id: job.id,
      _lease_token: job.lease_token,
      _publication_id: publication.id,
      _fields: {
      status: staleDesired ? "pending" : finalStatus,
      echo_payload_hash: remoteNormalizedHash,
      echo_expires_at: new Date(Date.now() + 120 * 60_000).toISOString(),
      remote_observed_hash: remoteNormalizedHash,
      remote_field_snapshot: Object.fromEntries(
        Object.entries(observedLocal).filter(([, value]) => value !== null && value !== undefined),
      ),
      remote_snapshot_at: nowIso,
      // Referência de comparação só avança quando o site confirmou os campos.
      ...(fullyConfirmed
        ? { last_published_hash: remoteNormalizedHash, baseline_at: nowIso }
        : {}),
      // Revisão só é dada como confirmada quando não sobrou pendência dela.
      ...(fullyConfirmed ? { confirmed_revision: job.requested_revision } : {}),
      last_payload_hash: hashPayload(fullPayload as never),
      last_payload_snapshot: nextSnapshot,
      confirmed_field_snapshot: confirmedLocalSnapshot,
      last_payload_synced_at: new Date().toISOString(),
      // Revisão sincronizada só avança sem nenhuma pendência.
      ...(fullyConfirmed ? { last_synced_revision: job.requested_revision } : {}),
      last_synced_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      last_field_verification: {
        ...fieldVerification,
        // Tentado ≠ confirmado: guarda o que foi enviado nesta revisão.
        attempted: sentPayload,
        revision: job.requested_revision,
      } as never,
      ...(publicUrl ? { external_public_url: publicUrl } : {}),
      last_error_category: finalStatus === "published" ? null : "protocol",
      last_error_message:
        finalStatus === "published"
          ? null
          : fieldVerification.divergent.length
            ? `O site não confirmou os campos: ${fieldVerification.divergent.join(", ")}.`
            : characteristics.incomplete
              ? "Algumas características não foram gravadas no site; serão reenviadas."
              : !verified
                ? "A leitura do site não confirmou a referência do imóvel."
                : "Verificação remota divergente.",
      },
    } as never,
  );
  if (publicationUpdateError) throw new Error(publicationUpdateError.message);
  if (publicationOwned !== true) throw new LeaseLostError(job.id);

  // Fotos seguem de forma assíncrona, exclusivamente por `media_sync`.
  const media = await queueMediaAfterCadastral(admin, job);

  return {
    status: staleDesired ? "superseded" : finalStatus,
    externalId,
    media,
    unmapped: resolution.unmapped,
    ambiguous: resolution.ambiguous,
    characteristics,
    verification: fieldVerification,
  };

}

export async function reconcilePublication(
  admin: Admin,
  publication: {
    id: string;
    property_id: string;
    provider: ImobiProvider;
    external_property_id: string | null;
    external_reference: string;
    last_payload_hash: string | null;
  },
  correlationId: string,
) {
  // Reconciliação SEMPRE lê a lista por referência: é assim que o sistema
  // enxerga duplicidade remota e recupera um ID perdido sem criar nada.
  const { lookup, match } = await lookupByReference(
    publication.provider,
    publication.external_reference,
    correlationId,
  );

  if (lookup.kind === "inconclusive") {
    // Pendência explícita: nada é decidido a partir de leitura inconclusiva.
    await admin
      .from("property_provider_publications")
      .update({
        status: "out_of_sync",
        remote_match_checked_at: new Date().toISOString(),
        last_error_category: "protocol",
        last_error_message: describeInconclusive(lookup.reason),
      })
      .eq("id", publication.id);
    throw inconclusiveError(publication.external_reference, lookup.reason);
  }

  if (lookup.kind === "duplicate") {
    const current = String(publication.external_property_id ?? "").trim();
    await recordRemoteMatch(admin, publication.id, match, {
      create_state: "remote_duplicate_detected",
      status: "out_of_sync",
      last_verified_at: new Date().toISOString(),
      last_error_category: "business",
      last_error_message: `O site tem ${match.count} anúncios com a referência ${publication.external_reference} (${match.ids.join(", ")}). Nenhuma criação nem exclusão automática será feita.`,
    });
    return {
      status: "out_of_sync" as const,
      duplicates: match.ids,
      canonicalId: current && match.ids.includes(current) ? current : null,
    };
  }

  const externalId =
    publication.external_property_id ?? (lookup.kind === "unique" ? lookup.externalId : null);

  await recordRemoteMatch(admin, publication.id, match);

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
  const remoteSet = (remote?.["resultSet"] as Record<string, unknown> | undefined) ?? remote ?? {};
  const remoteReference = String(remoteSet["referenciaImovel"] ?? remoteSet["referencia"] ?? "").trim();
  const found = remoteReference.toUpperCase() === publication.external_reference.toUpperCase();
  // Existência não é confirmação: pendências cadastrais continuam pendentes.
  const [{ data: pendingRow, error: pendingError }, { data: localRow, error: localError }] = await Promise.all([
    admin
    .from("property_provider_publications")
    .select("status, last_field_verification, confirmed_revision, desired_availability, enabled")
    .eq("id", publication.id)
    .maybeSingle(),
    admin.from("properties").select("revision").eq("id", publication.property_id).single(),
  ]);
  if (pendingError || localError) throw new Error(pendingError?.message ?? localError?.message);
  const pendingVerification = (pendingRow?.last_field_verification ?? null) as { divergent?: string[] } | null;
  const hasPending =
    pendingRow?.status !== "published" ||
    pendingRow?.desired_availability !== "visible" ||
    pendingRow?.enabled !== true ||
    Number(pendingRow?.confirmed_revision ?? 0) < Number(localRow?.revision ?? 0) ||
    (Array.isArray(pendingVerification?.divergent) && pendingVerification!.divergent!.length > 0);
  const publicUrl = extractPublicUrl(publication.provider, remote, externalId);
  const { error: updateError } = await admin
    .from("property_provider_publications")
    .update({
      external_property_id: externalId,
      ...(publicUrl ? { external_public_url: publicUrl } : {}),
      status: found ? (hasPending ? "partial" : "published") : "out_of_sync",
      last_verified_at: new Date().toISOString(),
      last_error_message: found
        ? hasPending
          ? "Imóvel existe no site, mas ainda há campos sem confirmação."
          : null
        : "Divergência detectada na reconciliação.",
    })
    .eq("id", publication.id);
  if (updateError) throw new Error(updateError.message);
  // Reconciliação é read-only na direção externa: o cadastro local nunca é sobrescrito.
  return { status: found ? (hasPending ? ("partial" as const) : ("published" as const)) : ("out_of_sync" as const), externalId };
}

/**
 * Trava de segurança (10/09/2026): enquanto `imobi_update_sync_paused` estiver
 * ligada, nenhuma alteração é enviada aos sites. Motivo: as atualizações em massa
 * de 08–09/09 coincidiram com o sumiço do proprietário vinculado no painel do
 * Imobi. Publicação, despublicação e exclusão continuam liberadas.
 */
async function isUpdateSyncPaused(admin: Admin): Promise<boolean> {
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "imobi_update_sync_paused")
    .maybeSingle();
  if (error || !data) {
    throw new Error("Não foi possível confirmar a configuração de pausa da integração.");
  }
  const value = (data?.value ?? null) as { paused?: boolean } | null;
  if (typeof value?.paused !== "boolean") {
    throw new Error("Configuração de pausa da integração inválida.");
  }
  return value?.paused === true;
}

/** Uma decisão de publicação posterior tornou este efeito externo obsoleto. */
export class ObsoleteIntentError extends Error {
  constructor(jobId: string) {
    super(`A decisão de publicação mudou durante o trabalho ${jobId}.`);
    this.name = "ObsoleteIntentError";
  }
}

/** Devolve para a fila jobs cujo lease expirou. Não depende de ação manual. */
export async function reclaimStaleSyncJobs(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc("property_sync_reclaim_stale");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function runSyncWorker(
  admin: Admin,
  options: { limit?: number; workerId?: string; kind?: WorkerKind } = {},
) {
  const kind: WorkerKind = options.kind ?? "cadastral";
  const workerId = options.workerId ?? `worker-${kind}-${crypto.randomUUID().slice(0, 8)}`;
  const updatesPaused = await isUpdateSyncPaused(admin);
  // Claim filtrado por ação: o worker cadastral nunca reivindica mídia (lenta) e
  // o worker de mídia processa um job por vez — nenhum job fica preso em
  // `processing` porque outro estourou o tempo do request.
  const { data: jobs, error } = await admin.rpc("property_sync_claim_jobs", {
    _worker: workerId,
    _limit: claimLimitFor(kind, options.limit ?? 5),
    _lease_seconds: leaseSecondsFor(kind),
    _actions: claimActionsFor(kind),
  });
  if (error) throw new Error(error.message);

  const claimed = (jobs ?? []) as unknown as SyncJob[];
  const results: Array<Record<string, unknown>> = [];

  for (const job of claimed) {
    const started = Date.now();
    try {
      // Reserva renovada imediatamente antes de cada trabalho: num lote, os
      // últimos jobs não podem perder a posse enquanto esperam a vez no limite
      // do site (era o que devolvia o mesmo trabalho à fila sem concluir).
      await assertJobLease(admin, job, leaseSecondsFor(kind));
      // Job superado: uma versão mais nova do imóvel já tem envio na fila e
      // levará o conteúdo atual. Este não é enviado (nada chega fora de ordem).
      if (job.action === "update" && (await isSupersededJob(admin, job))) {
        await finishJob(admin, job, {
          status: "cancelled",
          finished_at: new Date().toISOString(),
          last_error_message: "Absorvido por versão mais nova do imóvel.",
        });
        results.push({ jobId: job.id, provider: job.provider, status: "superseded" });
        continue;
      }
      const outcome = await processJob(admin, job, { updatesPaused });
      const outcomeStatus = (outcome as { status?: string } | undefined)?.status;
      const converged = job.action === "media_sync"
        ? outcomeStatus === "synced"
        : ["published", "unpublished", "deleted"].includes(String(outcomeStatus));
      const superseded = outcomeStatus === "superseded";
      const blockedImage = job.action === "media_sync" && outcomeStatus === "blocked_image";
      const businessConflict = outcomeStatus === "out_of_sync" &&
        Array.isArray((outcome as { duplicates?: unknown } | undefined)?.duplicates);
      const slowRecovery = ["delivery_unknown", "remote_read_unreliable", "out_of_sync", "waiting_watermark"].includes(String(outcomeStatus));
      const nextDelay = slowRecovery ? 3600 : job.attempts >= job.max_attempts ? 3600 : 75;
      const owned = job.action === "media_sync" && converged
        ? await finishMediaJob(admin, job)
        : await finishJob(admin, job, converged
          ? {
              status: "succeeded",
              finished_at: new Date().toISOString(),
              last_error_category: null,
              last_error_message: null,
            }
          : superseded
            ? {
                status: "cancelled",
                finished_at: new Date().toISOString(),
                last_error_message: "Absorvido por decisão ou revisão mais recente.",
              }
            : blockedImage
              ? {
                  status: "failed",
                  finished_at: new Date().toISOString(),
                  last_error_category: "validation",
                  last_error_message: "Uma foto ativa exige correção do arquivo ou processamento; uma nova revisão será retomada automaticamente.",
                }
            : businessConflict
              ? {
                  status: "failed",
                  finished_at: new Date().toISOString(),
                  last_error_category: "business",
                  last_error_message: "Conflito de anúncios no site exige decisão administrativa.",
                }
              : {
                  status: "retry",
                  attempts: Math.min(job.attempts, Math.max(0, job.max_attempts - 1)),
                  next_run_at: new Date(Date.now() + nextDelay * 1000).toISOString(),
                  last_error_category: "partial",
                  last_error_message: `Confirmação pendente (${outcomeStatus ?? "sem estado"}); retomada automática.`,
                });
      await logAttempt(admin, job, {
        step: job.action,
        ok: converged,
        durationMs: Date.now() - started,
        errorMessage: owned ? undefined : "Lease perdido: conclusão registrada por outra execução.",
      });
      results.push({ jobId: job.id, provider: job.provider, staleLease: !owned, ...outcome });
    } catch (error) {
      if (error instanceof ObsoleteIntentError) {
        const owned = await finishJob(admin, job, {
          status: "cancelled",
          finished_at: new Date().toISOString(),
          last_error_message: error.message,
        });
        results.push({ jobId: job.id, provider: job.provider, status: owned ? "superseded" : "lease_lost" });
        continue;
      }
      // Posse perdida: outra execução é dona do trabalho. Nada é gravado aqui —
      // nem conclusão, nem erro na publicação — para não sobrescrever o estado atual.
      if (error instanceof LeaseLostError) {
        results.push({ jobId: job.id, provider: job.provider, status: "lease_lost" });
        continue;
      }
      // Pausa: o trabalho VOLTA para a fila (retomável), sem consumir tentativa
      // e sem marcar erro na publicação.
      if (error instanceof PausedWriteError) {
        await finishJob(admin, job, {
          status: "retry",
          attempts: Math.max(0, job.attempts - 1),
          next_run_at: new Date(Date.now() + PAUSE_DEFER_SECONDS * 1000).toISOString(),
          last_error_category: "config",
          last_error_message: error.message,
        });
        results.push({ jobId: job.id, provider: job.provider, status: "deferred_paused" });
        continue;
      }
      // Mapeamento pendente: estado retomável com mensagem acionável. O trabalho
      // espera a correspondência ser definida, sem consumir tentativa.
      if (error instanceof MappingPendingError) {
        const mappingOwned = await finishJob(admin, job, {
          status: "retry",
          attempts: Math.max(0, job.attempts - 1),
          next_run_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          last_error_category: "mapping",
          last_error_message: error.message,
        });
        if (!mappingOwned) {
          results.push({ jobId: job.id, provider: job.provider, status: "lease_lost" });
          continue;
        }
        await admin
          .from("property_provider_publications")
          .update({
            status: "pending",
            last_error_category: "mapping",
            last_error_message: error.message,
          })
          .eq("property_id", job.property_id)
          .eq("provider", job.provider);
        await logAttempt(admin, job, {
          step: job.action,
          ok: false,
          errorCategory: "mapping",
          errorMessage: error.message,
        });
        results.push({ jobId: job.id, provider: job.provider, status: "pending_mapping" });
        continue;
      }
      const normalized = toImobiError(error);
      // Limite de requisições não consome tentativa: reagenda respeitando
      // `Retry-After` (ou a espera pedida pelo controle de limite).
      const rateLimited = normalized.category === "rate_limit";
      const waitSeconds = rateLimited
        ? Math.max(15, normalized.retryAfterSeconds ?? 30)
        : backoffSeconds(job.attempts);
      // Depois do orçamento normal, falhas técnicas continuam em recuperação
      // espaçada. 401/403, validação e conflito de negócio só acordam quando
      // configuração/dado mudar (ou no probe controlado do watchdog).
      const canRetry = rateLimited || normalized.retryable || normalized.ambiguous;
      const recoveryDelay = job.attempts >= job.max_attempts ? 3600 : waitSeconds;
      const stillOwned = await finishJob(admin, job, {
        status: canRetry ? "retry" : "failed",
        attempts: rateLimited || (canRetry && job.attempts >= job.max_attempts)
          ? Math.min(Math.max(0, job.attempts - 1), Math.max(0, job.max_attempts - 1))
          : job.attempts,
        next_run_at: new Date(Date.now() + recoveryDelay * 1000).toISOString(),
        finished_at: canRetry ? null : new Date().toISOString(),
        last_http_status: normalized.httpStatus,
        last_error_category: normalized.category,
        last_error_message: normalized.message,
      });
      // Sem posse, outra execução é dona do estado: não sobrescreve a publicação.
      if (!stillOwned) {
        results.push({ jobId: job.id, provider: job.provider, status: "lease_lost" });
        continue;
      }

      let publicationUpdate = admin
        .from("property_provider_publications")
        .update({
          // Esperando a vez (limite) ou nova tentativa agendada: continua
          // pendente, não "erro". Erro só quando as tentativas acabaram.
          status: canRetry ? "pending" : "error",
          last_error_category: normalized.category,
          last_error_message: canRetry
            ? `${normalized.message} Recuperação automática agendada.`
            : normalized.message,
        })
        .eq("property_id", job.property_id)
        .eq("provider", job.provider);
      if (job.publication_intent_revision != null) {
        publicationUpdate = publicationUpdate.eq("publication_intent_revision", job.publication_intent_revision);
      }
      const { error: publicationError } = await publicationUpdate;
      if (publicationError) throw new Error(publicationError.message);
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
