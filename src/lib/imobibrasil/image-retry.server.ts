/**
 * Varredura automática de envio de fotos. Server-only.
 *
 * Duas funções, ambas sem qualquer ação humana:
 *  1. reenvia as fotos que falharam assim que a espera programada vence;
 *  2. retoma publicações incompletas/desatualizadas que ficaram sem trabalho
 *     na fila, das mais antigas para as mais novas.
 *
 * Tudo acontece enfileirando um job `update` normal — o worker de sincronização
 * continua sendo o único lugar que fala com os sites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

type QueueKey = { property_id: string; provider: string };

/**
 * Reenfileira apenas MÍDIA (`media_sync`). Nunca `update`: alteração cadastral
 * segue protegida pela trava `imobi_update_sync_paused`.
 */
async function enqueueUpdates(admin: Admin, keys: QueueKey[]): Promise<number> {
  if (!keys.length) return 0;

  const propertyIds = Array.from(new Set(keys.map((key) => key.property_id)));
  const { data: properties } = await admin
    .from("properties")
    .select("id, gallery_revision, is_draft, archived_at")
    .in("id", propertyIds);

  const revisionById = new Map(
    (properties ?? [])
      .filter((row) => !row.is_draft && !row.archived_at)
      .map((row) => [row.id as string, Number(row.gallery_revision ?? 1)]),
  );

  // Coalescido pela própria rotina do banco: no máximo um job pendente por
  // (imóvel, site), sempre na versão mais recente da galeria.
  let enqueued = 0;
  for (const key of keys) {
    const revision = revisionById.get(key.property_id);
    if (!revision) continue;
    const { error } = await admin.rpc("queue_media_sync_coalesced", {
      _property_id: key.property_id,
      _provider: key.provider,
      _revision: revision,
      _requested_by: null,
    });
    if (error) throw new Error(error.message);
    enqueued += 1;
  }
  return enqueued;
}

export type ImageSweepResult = {
  retriedImages: number;
  retriedProperties: number;
  resumedPublications: number;
  enqueued: number;
};

/**
 * @param options.limit         imóveis reenfileirados por falha de foto
 * @param options.backfillLimit publicações incompletas retomadas por ciclo
 */
export async function runImageDeliverySweep(
  admin: Admin,
  options: { limit?: number; backfillLimit?: number } = {},
): Promise<ImageSweepResult> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const backfillLimit = Math.min(100, Math.max(0, options.backfillLimit ?? 25));
  const now = new Date().toISOString();

  // 1. Fotos com falha cuja próxima tentativa já venceu.
  const { data: dueImages, error: dueError } = await admin
    .from("property_image_provider_publications")
    .select("image_id, publication_id, provider, next_retry_at")
    .eq("status", "error")
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .limit(limit * 20);
  if (dueError) throw new Error(dueError.message);

  const publicationIds = Array.from(
    new Set((dueImages ?? []).map((row) => row.publication_id as string)),
  );

  let retryKeys: QueueKey[] = [];
  if (publicationIds.length) {
    const { data: publications } = await admin
      .from("property_provider_publications")
      .select("id, property_id, provider, enabled")
      .in("id", publicationIds);
    retryKeys = (publications ?? [])
      .filter((row) => row.enabled !== false)
      .slice(0, limit)
      .map((row) => ({ property_id: row.property_id as string, provider: row.provider as string }));
  }

  // 2. Publicações que ficaram incompletas/desatualizadas sem job ativo.
  let resumeKeys: QueueKey[] = [];
  if (backfillLimit > 0) {
    const { data: stalled } = await admin
      .from("property_provider_publications")
      .select("property_id, provider, status, enabled, last_synced_at")
      .in("status", ["partial", "out_of_sync"])
      .eq("enabled", true)
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(backfillLimit);
    resumeKeys = (stalled ?? []).map((row) => ({
      property_id: row.property_id as string,
      provider: row.provider as string,
    }));
  }

  const seen = new Set<string>();
  const keys = [...retryKeys, ...resumeKeys].filter((key) => {
    const id = `${key.property_id}:${key.provider}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const enqueued = await enqueueUpdates(admin, keys);

  return {
    retriedImages: (dueImages ?? []).length,
    retriedProperties: retryKeys.length,
    resumedPublications: resumeKeys.length,
    enqueued,
  };
}
