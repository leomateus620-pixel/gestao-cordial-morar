/**
 * Envio resiliente de anexos de aluguel.
 * O armazenamento pode gravar o arquivo e mesmo assim não devolver a
 * confirmação (504/queda de conexão). Nesses casos conferimos se o objeto
 * existe antes de reenviar, e o registro no contrato é idempotente por caminho.
 */
export interface UploadDeps {
  upload: (path: string, file: Blob, contentType: string, signal: AbortSignal) => Promise<{ error: { message: string; statusCode?: string | number } | null }>;
  exists: (path: string) => Promise<boolean>;
  register: (path: string) => Promise<unknown>;
  timeoutMs?: number;
}

export function isTransientUploadError(message: string, status?: string | number): boolean {
  const s = Number(status);
  if (Number.isFinite(s) && s >= 500) return true;
  return /\b50[234]\b|timeout|timed out|abort|network|failed to fetch|load failed|fetch failed/i.test(message);
}

/** Envia (ou confirma) o arquivo no caminho fixo e registra no contrato. */
export async function uploadAndRegister(path: string, file: Blob, contentType: string, deps: UploadDeps): Promise<unknown> {
  const timeoutMs = deps.timeoutMs ?? 25_000;
  let stored = await deps.exists(path).catch(() => false);
  for (let attempt = 0; !stored && attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let errMsg: string | null = null;
    let status: string | number | undefined;
    try {
      const { error } = await deps.upload(path, file, contentType, ctrl.signal);
      if (error) { errMsg = error.message; status = error.statusCode; }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
    if (!errMsg) { stored = true; break; }
    // Pode ter sido gravado mesmo com erro (ex.: "já existe" após 504).
    if (await deps.exists(path).catch(() => false)) { stored = true; break; }
    if (!isTransientUploadError(errMsg, status) || attempt === 1) {
      throw new Error(ctrl.signal.aborted ? "O envio demorou demais. Tente novamente." : errMsg);
    }
  }
  return deps.register(path);
}

export function friendlyUploadError(fileName: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (isTransientUploadError(msg)) return `"${fileName}": o servidor demorou para responder. Clique em "Tentar novamente".`;
  return `"${fileName}": ${msg}`;
}
