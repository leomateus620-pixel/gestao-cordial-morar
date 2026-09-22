/**
 * Autenticação única das rotinas automáticas (workers e ganchos de cron).
 *
 * Regra (22/09/2026): a chave pública do app NÃO é mais aceita como credencial
 * de execução. Só valem segredos exclusivos de servidor — `WORKER_HOOK_SECRET`
 * (padrão) e `PROPERTY_SYNC_WORKER_SECRET` (compatibilidade durante a troca).
 */

/** Segredos aceitos pelos ganchos internos, na ordem de preferência. */
export function workerSecrets(): string[] {
  return [process.env["WORKER_HOOK_SECRET"], process.env["PROPERTY_SYNC_WORKER_SECRET"]].filter(
    (value): value is string => Boolean(value),
  );
}

/** Credencial usada pelo próprio app ao acordar um worker. */
export function workerCallerSecret(): string | null {
  return workerSecrets()[0] ?? null;
}

/**
 * Devolve uma resposta de erro quando a chamada não está autorizada,
 * ou `null` quando pode seguir.
 */
export function authorizeWorkerRequest(request: Request): Response | null {
  const accepted = workerSecrets();
  if (!accepted.length) {
    return Response.json({ error: "Worker credentials not configured" }, { status: 503 });
  }
  const provided =
    request.headers.get("apikey") ??
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!provided || !accepted.includes(provided)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
