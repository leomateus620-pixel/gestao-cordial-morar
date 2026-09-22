/**
 * Limite de requisições por site, compartilhado entre todos os envios.
 *
 * A ImobiBrasil aceita no máximo 20 requisições por minuto por conta. O
 * controle fica no banco (`provider_rate_acquire`), então dois workers
 * rodando ao mesmo tempo respeitam o mesmo teto.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const LIMIT = 18; // margem de segurança sobre o teto de 20/min
const WINDOW_SECONDS = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera até haver vaga para uma chamada ao site. */
export async function acquireProviderSlot(
  admin: Admin,
  provider: string,
  options: { maxWaitMs?: number } = {},
): Promise<{ granted: boolean; waitedMs: number; unavailable?: boolean }> {
  const maxWait = options.maxWaitMs ?? 75_000;
  const started = Date.now();

  for (;;) {
    let waitMs = 0;
    try {
      const { data, error } = await admin.rpc("provider_rate_acquire", {
        _provider: provider,
        _limit: LIMIT,
        _window_seconds: WINDOW_SECONDS,
      });
      if (error) return { granted: false, waitedMs: Date.now() - started, unavailable: true };
      const result = (data ?? {}) as { granted?: boolean; waitMs?: number };
      if (result.granted) return { granted: true, waitedMs: Date.now() - started };
      waitMs = Math.max(500, Math.min(15_000, Number(result.waitMs ?? 2000)));
    } catch {
      // Controle indisponível: postura conservadora — NÃO chama o site sem vaga
      // garantida; o envio é adiado e tentado de novo mais tarde.
      return { granted: false, waitedMs: Date.now() - started, unavailable: true };
    }

    if (Date.now() - started + waitMs > maxWait) {
      return { granted: false, waitedMs: Date.now() - started };
    }
    await sleep(waitMs);
  }
}
