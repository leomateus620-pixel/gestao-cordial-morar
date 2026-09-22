/**
 * Pipeline de importação dos imóveis publicados nos sites (Cordial / Morar).
 * Server-only, persistente e retomável: todo o estado vive no banco
 * (`property_import_runs` / `property_import_jobs` / `property_import_candidates`),
 * então timeout, deploy ou navegador fechado não interrompem o processo.
 *
 * A importação é READ-ONLY na API externa: nada é criado, alterado ou excluído
 * nos sites durante o bootstrap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractExternalId, hasProviderToken } from "./client.server";
import { sanitizeMessage, toImobiError } from "./errors";
import { nextListStep, type ListStatus } from "./list-plan";
import { fetchPropertyDetail, fetchPropertyImages, fetchPropertyPage } from "./read.server";
import { buildStablePublicUrl } from "./public-url";
import {
  normalizeKey,
  normalizeRemoteImages,
  normalizeRemoteProperty,
  toPropertyRow,
  type NormalizedProperty,
} from "./import-normalizers";
import { matchProperty, type LocalCandidate } from "./dedupe";
import { applyRemoteChanges } from "./remote-changes.server";
import { buildExternalReference } from "./serializers";
import type { ImobiProvider } from "./providers";

type Admin = SupabaseClient;

const PER_PAGE = 50;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_HOSTS = [
  "cordialimoveis.com",
  "imobiliariamorarimoveis.com.br",
  "imobibrasil.com.br",
  "cdn-imobibrasil.com.br",
  "amazonaws.com",
  "cloudfront.net",
];

export type ImportMode = "dry_run" | "commit" | "incremental";

export type ImportJob = {
  id: string;
  run_id: string;
  provider: ImobiProvider;
  job_type: "fetch_page" | "hydrate_property" | "download_image" | "finalize";
  page: number | null;
  external_property_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  correlation_id: string;
};

// ---------------------------------------------------------------- utilidades

export async function sha256(bytes: ArrayBuffer | Uint8Array | string): Promise<string> {
  const data =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Remove dados sensíveis do proprietário antes de persistir o payload remoto.
 * Exceção deliberada: o código do vínculo (`codigoProprietario`/`codigoCorretor`) é
 * guardado — é ele que permite reenviar o proprietário nas alterações sem apagá-lo.
 */
const KEEP_LINK_KEYS = /^codigo(Proprietario|Corretor|UsuarioAdicional)$/i;

export function sanitizeRemotePayload(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (KEEP_LINK_KEYS.test(key)) {
      out[key] = value;
      continue;
    }
    if (/proprietario|telefone|celular|email|cpf|cnpj|senha|token/i.test(key)) continue;
    out[key] = value && typeof value === "object" && !Array.isArray(value)
      ? sanitizeRemotePayload(value as Record<string, unknown>)
      : value;
  }
  return out;
}

function backoffSeconds(attempts: number): number {
  const base = Math.min(1800, 30 * 2 ** Math.max(0, attempts - 1));
  return base + Math.floor(Math.random() * 15);
}

async function bumpRun(admin: Admin, runId: string, deltas: Record<string, number>) {
  const keys = Object.keys(deltas);
  if (!keys.length) return;
  const { data, error: readError } = await admin.from("property_import_runs").select(keys.join(",")).eq("id", runId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!data) throw new Error("Importação não encontrada ao atualizar contadores.");
  const patch: Record<string, number> = {};
  for (const key of keys) {
    patch[key] = Number((data as unknown as Record<string, unknown>)[key] ?? 0) + (deltas[key] ?? 0);
  }
  const { error } = await admin.from("property_import_runs").update(patch).eq("id", runId);
  if (error) throw new Error(error.message);
}

async function enqueueJob(
  admin: Admin,
  job: {
    runId: string;
    provider: ImobiProvider;
    type: ImportJob["job_type"];
    idempotencyKey: string;
    page?: number;
    externalPropertyId?: string;
    payload?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("property_import_jobs").upsert(
    {
      run_id: job.runId,
      provider: job.provider,
      job_type: job.type,
      idempotency_key: job.idempotencyKey,
      page: job.page ?? null,
      external_property_id: job.externalPropertyId ?? null,
      payload: job.payload ?? {},
      status: "pending",
      next_run_at: new Date().toISOString(),
    },
    { onConflict: "run_id,idempotency_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

// --------------------------------------------------------------- comando

export async function startImportRun(
  admin: Admin,
  options: { provider: ImobiProvider; mode: ImportMode; requestedBy: string },
) {
  if (!hasProviderToken(options.provider)) {
    throw new Error(`Token do provedor ${options.provider} não configurado.`);
  }

  const { data: active, error: activeError } = await admin
    .from("property_import_runs")
    .select("id, status, mode")
    .eq("provider", options.provider)
    .in("status", ["queued", "running", "paused"])
    .maybeSingle();
  if (activeError) throw new Error(activeError.message);
  if (active) {
    throw new Error("Já existe uma importação em andamento para este site. Pause ou aguarde a conclusão.");
  }

  const { data: run, error } = await admin
    .from("property_import_runs")
    .insert({
      provider: options.provider,
      mode: options.mode,
      status: "running",
      requested_by: options.requestedBy,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await enqueueJob(admin, {
    runId: run.id,
    provider: options.provider,
    type: "fetch_page",
    idempotencyKey: "page:1",
    page: 1,
  });

  return run;
}

// --------------------------------------------------------------- etapas

async function processFetchPage(admin: Admin, job: ImportJob) {
  const page = job.page ?? 1;
  // Ativos primeiro, depois inativos. Falha na leitura lança erro e o job é
  // repetido — nunca avança nem conclui ausência.
  const status: ListStatus = job.payload?.["status"] === "inativo" ? "inativo" : "ativo";
  const result = await fetchPropertyPage(job.provider, page, PER_PAGE, job.correlation_id, status);
  if (result.recognized === false) {
    // Resposta sem lista reconhecível: repete a página em vez de concluir "vazio".
    throw new Error("Resposta do site sem lista reconhecível; a página será lida de novo.");
  }
  if (result.page !== page || result.items.some((item) => !extractExternalId(item))) {
    throw new Error("Página de imóveis incompleta ou sem identidade estável; cursor preservado para nova leitura.");
  }

  let discovered = 0;
  for (const item of result.items) {
    const externalId = extractExternalId(item);
    if (!externalId) throw new Error("Imóvel da página sem código externo.");
    discovered += 1;
    await enqueueJob(admin, {
      runId: job.run_id,
      provider: job.provider,
      type: "hydrate_property",
      idempotencyKey: `hydrate:${externalId}`,
      externalPropertyId: externalId,
      payload: { listStatus: status },
    });
  }

  // Sem total informado, página cheia indica que pode haver a próxima.
  const totalPages =
    result.totalPagesKnown === false
      ? result.items.length >= PER_PAGE
        ? page + 1
        : page
      : Math.max(result.totalPages, page);
  const next = nextListStep({ status, page, totalPages });
  if (next.kind === "page") {
    await enqueueJob(admin, {
      runId: job.run_id,
      provider: job.provider,
      type: "fetch_page",
      idempotencyKey: next.key,
      page: next.page,
      payload: { status: next.status },
    });
  } else {
    await enqueueJob(admin, {
      runId: job.run_id,
      provider: job.provider,
      type: "finalize",
      idempotencyKey: "finalize",
    });
  }

  const { error: checkpointError } = await admin
    .from("property_import_runs")
    .update({ pages_discovered: totalPages, checkpoint: { lastPage: page, status, perPage: result.perPage } })
    .eq("id", job.run_id);
  if (checkpointError) throw new Error(checkpointError.message);
  await bumpRun(admin, job.run_id, { pages_processed: 1, properties_discovered: discovered });

  return { page, status, discovered, totalPages };
}

async function loadLocalCandidates(
  admin: Admin,
  provider: ImobiProvider,
  remote: NormalizedProperty,
): Promise<LocalCandidate[]> {
  const columns =
    "id, carteira, source, source_property_id, codigo, referencia, operacao, tipo, cidade, bairro, logradouro, numero, valor, area_principal";
  const filters: string[] = [`source_property_id.eq.${remote.externalId}`];
  if (remote.codigo) filters.push(`codigo.eq.${remote.codigo}`);
  if (remote.externalReference) filters.push(`referencia.eq.${remote.externalReference}`);

  const [direct, contextual] = await Promise.all([
    admin.from("properties").select(columns).or(filters.join(",")).limit(20),
    remote.cidade
      ? admin
          .from("properties")
          .select(columns)
          .eq("cidade", remote.cidade)
          .eq("operacao", remote.operacao)
          .limit(300)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  if (direct.error) throw new Error(direct.error.message);
  if ("error" in contextual && contextual.error) throw new Error(contextual.error.message);

  const map = new Map<string, LocalCandidate>();
  for (const row of [...((direct.data ?? []) as LocalCandidate[]), ...(((contextual as { data?: unknown[] }).data ?? []) as LocalCandidate[])]) {
    map.set(row.id, row);
  }
  return Array.from(map.values());
}

/** Uma conta diferente só é vinculada automaticamente pela referência GC
 * derivada do UUID local. Similaridade de endereço/referência comercial exige
 * revisão e jamais cria outra cópia local por omissão do matcher. */
async function crossAccountMatch(
  admin: Admin,
  provider: ImobiProvider,
  remote: NormalizedProperty,
  candidates: LocalCandidate[],
): Promise<{ propertyId: string | null; status: "exact_match" | "probable_match" | "ambiguous"; confidence: number; reason: string; alternatives: string[] } | null> {
  if (remote.externalReference) {
    const { data, error } = await admin.from("property_provider_publications")
      .select("property_id, external_reference")
      .neq("provider", provider)
      .eq("external_reference", remote.externalReference);
    if (error) throw new Error(error.message);
    const canonical = [...new Set((data ?? [])
      .filter((row) => buildExternalReference(row.property_id as string) === remote.externalReference)
      .map((row) => row.property_id as string))];
    if (canonical.length === 1) {
      return { propertyId: canonical[0]!, status: "exact_match", confidence: 1,
        reason: "Referência GC estável do mesmo imóvel local na outra conta.", alternatives: [] };
    }
    if (canonical.length > 1) {
      return { propertyId: null, status: "ambiguous", confidence: 0,
        reason: "Referência GC aponta para mais de um imóvel local.", alternatives: canonical };
    }
  }
  const foreign = candidates.filter((candidate) => candidate.carteira !== provider);
  const plausible = foreign.filter((candidate) =>
    (Boolean(remote.externalReference) && normalizeKey(candidate.referencia) === normalizeKey(remote.externalReference)) ||
    (Boolean(remote.logradouro && remote.numero && remote.cidade) &&
      normalizeKey(candidate.logradouro) === normalizeKey(remote.logradouro) &&
      normalizeKey(candidate.numero) === normalizeKey(remote.numero) &&
      normalizeKey(candidate.cidade) === normalizeKey(remote.cidade) &&
      normalizeKey(candidate.tipo) === normalizeKey(remote.tipo)),
  );
  if (!plausible.length) return null;
  return {
    propertyId: plausible.length === 1 ? plausible[0]!.id : null,
    status: plausible.length === 1 ? "probable_match" : "ambiguous",
    confidence: 0.7,
    reason: "Há imóvel semelhante já vinculado à outra conta; identidade precisa de confirmação.",
    alternatives: plausible.map((candidate) => candidate.id),
  };
}

/** Preenche apenas colunas ainda vazias — importação nunca sobrescreve dado local. */
/** Snapshot do que o site descreve, no espaço de colunas do Gestão. */
export function remoteRowSnapshot(remote: NormalizedProperty): Record<string, unknown> {
  const row = toPropertyRow(remote) as Record<string, unknown>;
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) snapshot[key] = value;
  }
  return snapshot;
}


async function ensurePublication(
  admin: Admin,
  input: {
    propertyId: string;
    provider: ImobiProvider;
    externalId: string;
    externalReference: string | null;
    remoteHash: string;
    runId: string;
    /** O cadastro local ficou REALMENTE igual ao remoto? Só então a referência avança. */
    localMatchesRemote: boolean;
    remoteSnapshot?: Record<string, unknown>;
  },
) {
  const { data: existing, error: readError } = await admin
    .from("property_provider_publications")
    .select("id, external_property_id, enabled")
    .eq("property_id", input.propertyId)
    .eq("provider", input.provider)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) {
    if (existing.external_property_id !== input.externalId) {
      throw new Error("Vínculo da conta já aponta para outro código remoto; exige decisão administrativa.");
    }
    // Leitura/importação não reativa uma publicação desabilitada nem marca
    // pendências como published. O merge posterior grava somente observações.
    return { id: existing.id as string, enabled: Boolean(existing.enabled) };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin.from("property_provider_publications").insert({
    property_id: input.propertyId,
    provider: input.provider,
    enabled: true,
    external_property_id: input.externalId,
    external_public_url: buildStablePublicUrl(input.provider, input.externalId),
    external_reference: input.externalReference ?? buildExternalReference(input.propertyId),
    status: input.localMatchesRemote ? "published" : "out_of_sync",
    remote_observed_hash: input.remoteHash,
    ...(input.remoteSnapshot ? { remote_field_snapshot: input.remoteSnapshot } : {}),
    remote_snapshot_at: now,
    ...(input.localMatchesRemote
      ? {
          last_published_hash: input.remoteHash,
          local_desired_hash: input.remoteHash,
          confirmed_field_snapshot: input.remoteSnapshot ?? null,
          baseline_at: now,
        }
      : {}),
    last_imported_at: now,
    last_verified_at: now,
    import_run_id: input.runId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, enabled: true };
}

async function processHydrate(admin: Admin, job: ImportJob, mode: ImportMode) {
  const externalId = job.external_property_id;
  if (!externalId) throw new Error("Job de hidratação sem código externo.");

  const detail = await fetchPropertyDetail(job.provider, externalId, job.correlation_id);
  const remote = normalizeRemoteProperty(job.provider, externalId, detail);
  const remoteHash = await sha256(JSON.stringify(remote));

  const { data: existingLink, error: linkReadError } = await admin
    .from("property_provider_publications")
    .select("id, property_id, enabled")
    .eq("provider", job.provider)
    .eq("external_property_id", externalId)
    .maybeSingle();
  if (linkReadError) throw new Error(linkReadError.message);

  const candidates = await loadLocalCandidates(admin, job.provider, remote);
  const localMatch = matchProperty(job.provider, remote, candidates);
  const crossMatch = existingLink ? null : await crossAccountMatch(admin, job.provider, remote, candidates);
  const match = existingLink
    ? { propertyId: existingLink.property_id as string, status: "exact_match" as const, confidence: 1, reason: "Vínculo já existente.", alternatives: [] as string[] }
    : crossMatch?.status === "exact_match" ? crossMatch
    : localMatch.status === "new" && crossMatch ? crossMatch : localMatch;

  const remoteImages = await fetchPropertyImages(job.provider, externalId, job.correlation_id);
  const images = normalizeRemoteImages(remoteImages);

  const { error: candidateError } = await admin.from("property_import_candidates").upsert(
    {
      run_id: job.run_id,
      provider: job.provider,
      external_property_id: externalId,
      external_reference: remote.externalReference,
      remote_payload: sanitizeRemotePayload(detail),
      normalized: remote as unknown as Record<string, unknown>,
      remote_hash: remoteHash,
      match_property_id: match.propertyId,
      match_confidence: match.confidence,
      match_reason: match.reason,
      images_count: images.length,
      status: match.status === "new" ? "new" : match.status,
    },
    { onConflict: "run_id,provider,external_property_id" },
  );
  if (candidateError) throw new Error(candidateError.message);

  await bumpRun(admin, job.run_id, {
    images_discovered: images.length,
    ...(match.status === "ambiguous" ? { properties_ambiguous: 1 } : {}),
  });

  if (mode === "dry_run") {
    return { mode, match: match.status, externalId, images: images.length };
  }

  if (match.status === "ambiguous" || match.status === "probable_match") {
    // Nunca decide sozinho: fica aguardando o administrador na tela de conflitos.
    return { mode, match: match.status, externalId, pendingReview: true };
  }
  if (existingLink && !existingLink.enabled) {
    const { error: inactiveError } = await admin.from("property_import_candidates")
      .update({ status: "external_discovered", match_property_id: existingLink.property_id })
      .eq("run_id", job.run_id).eq("provider", job.provider).eq("external_property_id", externalId);
    if (inactiveError) throw new Error(inactiveError.message);
    return { mode, match: match.status, externalId, disabledPublication: true };
  }

  const row = toPropertyRow(remote);
  let propertyId = match.propertyId;
  // Imóvel novo: o cadastro local nasce igual ao site, então a referência de
  // comparação pode nascer confirmada. Imóvel já existente: nunca — o conteúdo
  // local pode diferir, e a conferência campo a campo é feita abaixo.
  let localMatchesRemote = false;
  let localRow: Record<string, unknown> | null = null;

  if (propertyId) {
    const { data: local, error: localError } = await admin.from("properties").select("*").eq("id", propertyId).maybeSingle();
    if (localError) throw new Error(localError.message);
    if (!local) throw new Error("Imóvel vinculado deixou de existir; importação será recalculada.");
    localRow = local as Record<string, unknown>;
    // source_property_id é legado de UMA conta. O vínculo correto para Cordial
    // e Morar vive na tabela de publicações e não substitui o da outra conta.
    await bumpRun(admin, job.run_id, { properties_linked: 1 });
  } else {
    const { data: created, error } = await admin
      .from("properties")
      .insert({
        ...row,
        source: `${job.provider}_api`,
        source_property_id: externalId,
        source_import_batch: job.run_id,
        is_draft: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    propertyId = created.id as string;
    localMatchesRemote = true;
    await bumpRun(admin, job.run_id, { properties_created: 1 });
  }

  const publication = await ensurePublication(admin, {
    propertyId,
    provider: job.provider,
    externalId,
    externalReference: remote.externalReference,
    remoteHash,
    runId: job.run_id,
    localMatchesRemote,
    remoteSnapshot: remoteRowSnapshot(remote),
  });
  const publicationId = publication.id;
  if (!publication.enabled) {
    return { mode, match: match.status, externalId, disabledPublication: true };
  }

  // Importação incremental: aplica o que mudou só no site, preserva edição e
  // limpeza locais e registra divergência quando os dois lados mudaram.
  if (localRow) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [{ data: currentLocal, error: localError }, { data: pub, error: pubError }] = await Promise.all([
        admin.from("properties").select("*").eq("id", propertyId).single(),
        admin.from("property_provider_publications")
          .select("id, property_id, provider, external_property_id, updated_at, confirmed_field_snapshot, echo_payload_hash, echo_expires_at")
          .eq("id", publicationId).single(),
      ]);
      if (localError || pubError || !currentLocal || !pub) {
        throw new Error(localError?.message ?? pubError?.message ?? "Vínculo local indisponível durante a importação.");
      }
      try {
        await applyRemoteChanges(admin, {
          publication: pub as never,
          localRow: currentLocal as Record<string, unknown>,
          remote,
          remoteHash,
          observeOther: async (otherProvider, otherExternalId) => {
            const detail = await fetchPropertyDetail(
              otherProvider as ImobiProvider, otherExternalId, job.correlation_id,
            );
            if (!detail || Object.keys(detail).length === 0) return null;
            const otherRemote = normalizeRemoteProperty(otherProvider as ImobiProvider, otherExternalId, detail);
            return remoteRowSnapshot(otherRemote);
          },
        });
        break;
      } catch (error) {
        if (attempt === 2 || !/revision_changed|publication_changed|other_publication_changed/.test(String(error))) throw error;
      }
    }
  }

  const { error: commitError } = await admin
    .from("property_import_candidates")
    .update({ status: "committed", match_property_id: propertyId })
    .eq("run_id", job.run_id)
    .eq("provider", job.provider)
    .eq("external_property_id", externalId);
  if (commitError) throw new Error(commitError.message);

  for (const image of images) {
    await enqueueJob(admin, {
      runId: job.run_id,
      provider: job.provider,
      type: "download_image",
      idempotencyKey: `image:${externalId}:${image.externalImageId ?? image.url}`,
      externalPropertyId: externalId,
      payload: { ...image, propertyId, publicationId },
    });
  }

  return { mode, match: match.status, externalId, propertyId, images: images.length };
}

function imageHostAllowed(url: URL): boolean {
  return ALLOWED_IMAGE_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

async function processImage(admin: Admin, job: ImportJob) {
  const payload = job.payload as {
    propertyId: string;
    publicationId: string;
    url: string;
    isCover?: boolean;
    position?: number;
    externalImageId?: string | null;
  };
  const url = new URL(payload.url);
  if (url.protocol !== "https:" || !imageHostAllowed(url)) {
    throw new Error("Domínio de imagem não permitido.");
  }

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Falha HTTP ${response.status} ao baixar a imagem.`);
  const mime = response.headers.get("content-type") ?? "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("Conteúdo remoto não é uma imagem.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Tamanho de imagem inválido.");
  }

  const hash = await sha256(buffer);

  const { data: duplicate } = await admin
    .from("property_images")
    .select("id")
    .eq("property_id", payload.propertyId)
    .eq("content_hash", hash)
    .maybeSingle();

  let imageId = duplicate?.id as string | undefined;

  if (!imageId) {
    const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const storagePath = `${job.provider}/${payload.propertyId}/${hash}.${extension}`;
    const upload = await admin.storage
      .from("property-images")
      .upload(storagePath, buffer, { contentType: mime, upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    const { data: inserted, error } = await admin
      .from("property_images")
      .insert({
        property_id: payload.propertyId,
        storage_path: storagePath,
        file_name: `${hash.slice(0, 12)}.${extension}`,
        mime_type: mime,
        size_bytes: buffer.byteLength,
        content_hash: hash,
        is_cover: Boolean(payload.isCover),
        position: payload.position ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    imageId = inserted.id as string;
  }

  await admin.from("property_image_provider_publications").upsert(
    {
      image_id: imageId,
      publication_id: payload.publicationId,
      provider: job.provider,
      external_image_id: payload.externalImageId ?? null,
      remote_url: payload.url,
      content_hash: hash,
      is_cover: Boolean(payload.isCover),
      status: "synced",
      synced_at: new Date().toISOString(),
    },
    { onConflict: "image_id,publication_id" },
  );

  await bumpRun(admin, job.run_id, { images_imported: 1 });
  return { imageId, hash, reused: Boolean(duplicate) };
}

async function processFinalize(admin: Admin, job: ImportJob) {
  const { count: pending } = await admin
    .from("property_import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("run_id", job.run_id)
    .neq("job_type", "finalize")
    .in("status", ["pending", "processing", "retry"]);

  if ((pending ?? 0) > 0) {
    // Ainda há trabalho: reagenda a finalização.
    await admin
      .from("property_import_jobs")
      .update({ status: "retry", next_run_at: new Date(Date.now() + 15_000).toISOString(), attempts: 0 })
      .eq("id", job.id);
    return { finalized: false, pending };
  }

  const { count: failed } = await admin
    .from("property_import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("run_id", job.run_id)
    .eq("status", "failed");

  await admin
    .from("property_import_runs")
    .update({
      status: (failed ?? 0) > 0 ? "completed_with_errors" : "completed",
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.run_id);

  return { finalized: true, failed: failed ?? 0 };
}

// --------------------------------------------------------------- worker

export async function runImportWorker(
  admin: Admin,
  options: { limit?: number; workerId?: string } = {},
) {
  const workerId = options.workerId ?? `import-${crypto.randomUUID().slice(0, 8)}`;
  const { data: claimed, error } = await admin.rpc("property_import_claim_jobs", {
    _worker: workerId,
    _limit: options.limit ?? 4,
    _lease_seconds: 180,
  });
  if (error) throw new Error(error.message);

  const jobs = (claimed ?? []) as unknown as ImportJob[];
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    try {
      const { data: run } = await admin
        .from("property_import_runs")
        .select("mode, status")
        .eq("id", job.run_id)
        .maybeSingle();
      const mode = (run?.mode ?? "dry_run") as ImportMode;

      let outcome: Record<string, unknown>;
      if (job.job_type === "fetch_page") outcome = await processFetchPage(admin, job);
      else if (job.job_type === "hydrate_property") outcome = await processHydrate(admin, job, mode);
      else if (job.job_type === "download_image") outcome = await processImage(admin, job);
      else outcome = await processFinalize(admin, job);

      const stillQueued = job.job_type === "finalize" && outcome["finalized"] === false;
      if (!stillQueued) {
        await admin
          .from("property_import_jobs")
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
      }
      results.push({ jobId: job.id, type: job.job_type, ...outcome });
    } catch (error) {
      const normalized = toImobiError(error);
      const canRetry = normalized.retryable && job.attempts < job.max_attempts;
      await admin
        .from("property_import_jobs")
        .update({
          status: canRetry ? "retry" : "failed",
          next_run_at: new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString(),
          finished_at: canRetry ? null : new Date().toISOString(),
          locked_at: null,
          lock_expires_at: null,
          locked_by: null,
          last_error_category: normalized.category,
          last_error_message: sanitizeMessage(normalized.message, 300),
        })
        .eq("id", job.id);
      if (!canRetry) {
        await bumpRun(admin, job.run_id, {
          ...(job.job_type === "download_image" ? { images_errored: 1 } : { properties_errored: 1 }),
        });
      }
      results.push({ jobId: job.id, type: job.job_type, error: sanitizeMessage(normalized.message, 200) });
    }
  }

  // "remaining" precisa refletir apenas o que o claim consegue pegar (runs ativas e jobs vencidos),
  // senão jobs órfãos de runs concluídas fazem o worker se reencadear infinitamente sem processar nada.
  const { data: activeRuns } = await admin
    .from("property_import_runs")
    .select("id")
    .in("status", ["queued", "running"]);
  const activeIds = (activeRuns ?? []).map((run) => run.id);
  let remaining = 0;
  if (activeIds.length) {
    const { count } = await admin
      .from("property_import_jobs")
      .select("id", { count: "exact", head: true })
      .in("run_id", activeIds)
      .in("status", ["pending", "retry"])
      .lte("next_run_at", new Date().toISOString());
    remaining = count ?? 0;
  }

  return { workerId, processed: jobs.length, remaining, results };
}

// --------------------------------------------------- resolução de conflitos

export type ConflictResolution = "link_only" | "update_local" | "create_separate" | "ignore";

/**
 * Aplica a decisão do administrador sobre um candidato ambíguo/provável.
 * `link_only` nunca toca no cadastro local; `update_local` só sobrescreve
 * porque foi uma escolha explícita do administrador.
 */
export async function commitCandidate(
  admin: Admin,
  candidateId: string,
  resolution: ConflictResolution,
  actorId: string,
) {
  const { data: candidate, error } = await admin
    .from("property_import_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!candidate) throw new Error("Candidato de importação não encontrado.");

  const now = new Date().toISOString();
  const provider = candidate.provider as ImobiProvider;
  const externalId = candidate.external_property_id as string;
  const remote = candidate.normalized as unknown as NormalizedProperty;

  if (resolution === "ignore") {
    const { error: ignoreError } = await admin
      .from("property_import_candidates")
      .update({ status: "ignored", resolution, resolved_by: actorId, resolved_at: now })
      .eq("id", candidateId);
    if (ignoreError) throw new Error(ignoreError.message);
    return { status: "ignored" as const };
  }

  const row = toPropertyRow(remote);
  let propertyId = candidate.match_property_id as string | null;

  if (resolution === "create_separate" || !propertyId) {
    const { data: created, error: insertError } = await admin
      .from("properties")
      .insert({
        ...row,
        source: `${provider}_api`,
        source_property_id: externalId,
        source_import_batch: candidate.run_id,
        is_draft: false,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    propertyId = created.id as string;
  } else if (resolution === "update_local") {
    const { data: current, error: readError } = await admin.from("properties")
      .select("revision").eq("id", propertyId).single();
    if (readError) throw new Error(readError.message);
    const { data: updated, error: updateError } = await admin
      .from("properties")
      .update({ ...row, revision: Number(current.revision) + 1 })
      .eq("id", propertyId).eq("revision", current.revision).select("id").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error("revision_changed: o imóvel mudou durante a decisão administrativa.");
  }

  const publication = await ensurePublication(admin, {
    propertyId: propertyId!,
    provider,
    externalId,
    externalReference: (candidate.external_reference as string | null) ?? null,
    remoteHash: (candidate.remote_hash as string | null) ?? "",
    runId: candidate.run_id as string,
    // `link_only` mantém o conteúdo local: a referência NÃO pode nascer confirmada.
    localMatchesRemote: resolution !== "link_only",
    remoteSnapshot: remoteRowSnapshot(remote),
  });
  const publicationId = publication.id;
  if (!publication.enabled) throw new Error("Publicação desabilitada; importação não pode reativá-la.");

  const remoteImages = await fetchPropertyImages(provider, externalId);
  for (const image of normalizeRemoteImages(remoteImages)) {
    await enqueueJob(admin, {
      runId: candidate.run_id as string,
      provider,
      type: "download_image",
      idempotencyKey: `image:${externalId}:${image.externalImageId ?? image.url}`,
      externalPropertyId: externalId,
      payload: { ...image, propertyId, publicationId },
    });
  }

  const { error: commitError } = await admin
    .from("property_import_candidates")
    .update({
      status: "committed",
      resolution,
      resolved_by: actorId,
      resolved_at: now,
      match_property_id: propertyId,
    })
    .eq("id", candidateId);
  if (commitError) throw new Error(commitError.message);

  return { status: "committed" as const, propertyId };
}
