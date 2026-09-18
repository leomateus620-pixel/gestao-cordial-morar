/**
 * Política de fila da publicação de imóveis (puro, sem I/O — testável).
 *
 * Incidente 18/09/2026: um único worker reivindicou 8 jobs de uma vez; o primeiro
 * `media_sync` (que pode esperar até ~75s por slot do provedor e 90s por upload)
 * estourou o tempo do request e TODOS os jobs seguintes ficaram presos em
 * `processing` até o lease expirar — sem ninguém para devolvê-los à fila.
 *
 * Correção estrutural: dois workers com claim filtrado por ação. O worker
 * cadastral nunca reivindica mídia, e o de mídia processa um job por vez.
 */

export type QueueAction = "publish" | "update" | "unpublish" | "delete" | "reconcile" | "media_sync";

/** Ações cadastrais: rápidas e previsíveis. */
export const CADASTRAL_ACTIONS: QueueAction[] = [
  "publish",
  "update",
  "unpublish",
  "delete",
  "reconcile",
];

/** Ações de mídia: lentas (rate limit + upload sequencial). */
export const MEDIA_ACTIONS: QueueAction[] = ["media_sync"];

export type WorkerKind = "cadastral" | "media";

export function claimActionsFor(kind: WorkerKind): QueueAction[] {
  return kind === "media" ? [...MEDIA_ACTIONS] : [...CADASTRAL_ACTIONS];
}

/** Um worker de mídia jamais reivindica lote: um job por execução. */
export function claimLimitFor(kind: WorkerKind, requested: number): number {
  const safe = Math.max(1, Math.floor(requested || 1));
  return kind === "media" ? 1 : Math.min(10, safe);
}

/** Lease generoso para mídia (upload sequencial) e curto para cadastro. */
export function leaseSecondsFor(kind: WorkerKind): number {
  return kind === "media" ? 600 : 120;
}

/** Trava de segurança de 10/09/2026: alteração cadastral segue bloqueada. */
export function shouldCancelForPause(action: QueueAction, updatesPaused: boolean): boolean {
  return updatesPaused && action === "update";
}

export function isLeaseExpired(
  job: { status: string; lock_expires_at: string | null },
  now: Date = new Date(),
): boolean {
  if (job.status !== "processing" || !job.lock_expires_at) return false;
  return new Date(job.lock_expires_at).getTime() < now.getTime();
}
