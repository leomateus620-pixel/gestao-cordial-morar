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

async function enqueueUpdates(admin: Admin, keys: QueueKey[]): Promise<number> {
  if (!keys.length) return 0;

  const propertyIds = Array.from(new Set(keys.map((key) => key.property_id)));
  const [{ data: properties }, { data: activeJobs }] = await Promise.all([
    admin
      .from("properties")
      .select("id, revision, is_draft, archived_at")
      .in("id", propertyIds),
    admin
      .from("property_sync_jobs")
      .select("property_id, provider")
      .in("property_id", propertyIds)
      .in("status", ["pending", "processing", "retry"]),
  ]);

  const revisionById = new Map(
    (properties ?? [])
      .filter((row) => !row.is_draft && !row.archived_at)
      .map((row) => [row.id as string, Number(row.revision ?? 1)]),
  );
  const busy = new Set(
    (activeJobs ?? []).map((row) => `${row.property_id}:${row.provider}`),
  );

  const rows = keys
    .filter((key) => revisionById.has(key.property_id))
    .filter((key) => !busy.has(`${key.property_id}:${key.provider}`))
    .map((key) => ({
      property_id: key.property_id,
      provider: key.provider,
      action: "update",
      requested_revision: revisionById.get(key.property_id)!,
      status: "pending",
      attempts: 0,
      next_run_at: new Date().toISOString(),
      locked_at: null,
      lock_expires_at: null,
      locked_by: null,
      last_error_message: null,
      last_error_category: null,
    }));
  if (!rows.length) return 0;

  const { error } = await admin
    .from("property_sync_jobs")
    .upsert(rows, {
      onConflict: "property_id,provider,action,requested_revision",
      ignoreDuplicates: false,
    });
  if (error) throw new Error(error.message);
  return rows.length;
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
