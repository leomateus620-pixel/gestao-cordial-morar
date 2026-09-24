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
  return kind === "media" ? 600 : 300;
}

/**
 * Trava de alterações: quando ligada, nenhuma alteração cadastral é escrita no
 * site. A checagem é feita com a AÇÃO EFETIVA (um `publish` de imóvel que já
 * existe é uma alteração) e imediatamente antes da escrita externa.
 */
export function isWriteBlockedByPause(action: QueueAction, updatesPaused: boolean): boolean {
  return updatesPaused && (action === "update" || action === "unpublish");
}

/**
 * Trabalho bloqueado pela pausa fica RETOMÁVEL (`retry`), nunca cancelado: ao
 * liberar, a intenção atual de cada imóvel/destino volta sozinha para a fila.
 */
export function shouldDeferForPause(action: QueueAction, updatesPaused: boolean): boolean {
  return isWriteBlockedByPause(action, updatesPaused);
}

/** Espera curta e previsível enquanto a pausa estiver ligada. */
export const PAUSE_DEFER_SECONDS = 900;

/** Espera crescente apenas para leitura remota inconclusiva do mesmo imóvel. */
export function remoteReadDelaySeconds(streak: number, random = Math.random): number {
  const ladder = [120, 300, 900, 3600] as const;
  const base = ladder[Math.min(ladder.length - 1, Math.max(0, Math.floor(streak) - 1))] ?? 120;
  return base + Math.floor(Math.max(0, Math.min(1, random())) * Math.min(45, Math.ceil(base * 0.08)));
}

export function isLeaseExpired(
  job: { status: string; lock_expires_at: string | null },
  now: Date = new Date(),
): boolean {
  if (job.status !== "processing" || !job.lock_expires_at) return false;
  return new Date(job.lock_expires_at).getTime() < now.getTime();
}
