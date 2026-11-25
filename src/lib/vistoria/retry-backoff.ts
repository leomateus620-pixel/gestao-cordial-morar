// Espera crescente entre tentativas de envio e mensagens amigáveis.

export const MAX_ATTEMPTS = 5;
export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 60_000;

/** Espera antes da próxima tentativa, depois de `attempts` falhas (1 → 2 s, 2 → 4 s …, máx. 60 s). */
export function backoffDelay(attempts: number) {
  if (attempts <= 0) return 0;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempts - 1));
}

type Retryable = { status: string; attempts: number; nextAttemptAt?: number | null };

export const exhausted = (e: Retryable) => e.status === "erro" && e.attempts >= MAX_ATTEMPTS;

/** Pode tentar agora? Registros esperando ou esgotados são pulados sem travar os outros. */
export function isDue(e: Retryable, now: number) {
  if (exhausted(e)) return false;
  return !e.nextAttemptAt || e.nextAttemptAt <= now;
}

/** Quando acordar a fila de novo (null = nada esperando). */
export function nextWakeIn(list: Retryable[], now: number): number | null {
  let best: number | null = null;
  for (const e of list) {
    if (exhausted(e) || !e.nextAttemptAt || e.nextAttemptAt <= now) continue;
    const d = e.nextAttemptAt - now;
    if (best === null || d < best) best = d;
  }
  return best;
}

export function friendlyUploadError(online: boolean) {
  return online
    ? "Não foi possível enviar. Tentaremos de novo."
    : "Sem internet: as fotos serão enviadas quando a conexão voltar.";
}
