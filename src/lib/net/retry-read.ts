// Repetição curta apenas para LEITURAS com falha transitória do banco/rede.
// Nunca usar em escritas não idempotentes.

export const RETRY_READ_DELAYS_MS = [500, 1500, 3000] as const;

export function isTransientError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };
  const code = String(e.code ?? "");
  const status = Number(e.status ?? NaN);
  const message = String(e.message ?? (typeof error === "string" ? error : "")).toLowerCase();
  if (code === "PGRST002" || code === "57014" || code === "08006" || code === "08001") return true;
  if (status === 502 || status === 503 || status === 504 || status === 408) return true;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  return /pgrst002|schema cache|timed? ?out|timeout|fetch failed|failed to fetch|networkerror|network request failed|load failed|503|504/.test(
    message,
  );
}

type Result<T> = { data: T; error: unknown };

/**
 * Executa `fn` e repete até 3 vezes (0,5 s / 1,5 s / 3 s) quando o erro é
 * transitório. Aceita funções que lançam ou que devolvem `{ data, error }`.
 */
export async function retryRead<T>(
  fn: () => Promise<T>,
  opts: { delays?: readonly number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const delays = opts.delays ?? RETRY_READ_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempt = 0;
  for (;;) {
    try {
      const value = await fn();
      const err = (value as Partial<Result<unknown>> | null)?.error;
      if (err && isTransientError(err) && attempt < delays.length) {
        await sleep(delays[attempt++]);
        continue;
      }
      return value;
    } catch (error) {
      if (!isTransientError(error) || attempt >= delays.length) throw error;
      await sleep(delays[attempt++]);
    }
  }
}

/** Texto amigável em português para qualquer falha exibida ao usuário. */
export function friendlyErrorMessage(error: unknown, fallback = "Não foi possível concluir agora."): string {
  if (isTransientError(error)) return "Sistema temporariamente indisponível. Tentando reconectar…";
  const msg = String((error as { message?: unknown })?.message ?? "");
  // Mensagens em inglês/técnicas não chegam ao usuário.
  if (!msg || /[a-z]{3,}error|exception|undefined|null|pgrst|sqlstate|failed|unexpected|invalid/i.test(msg))
    return fallback;
  return msg;
}
