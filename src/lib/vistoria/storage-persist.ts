// Pede armazenamento persistente uma vez e avisa quando o espaço está baixo.

export const LOW_FREE_BYTES = 200 * 1024 * 1024;
export const LOW_MESSAGE =
  "O espaço do navegador está quase cheio. Envie as fotos pendentes antes de continuar.";
const ASKED_KEY = "vistoria:storage-persist-asked";

export function isQuotaLow(est: { quota?: number; usage?: number } | null | undefined) {
  if (!est?.quota) return false;
  const usage = est.usage ?? 0;
  return est.quota - usage < LOW_FREE_BYTES || usage / est.quota > 0.9;
}

type StorageManagerLike = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
};

/** Devolve true se o espaço está baixo. Nunca lança. */
export async function checkDeviceStorage(
  sm: StorageManagerLike | undefined,
  kv: Pick<Storage, "getItem" | "setItem"> | undefined,
): Promise<boolean> {
  if (!sm) return false;
  try {
    if (sm.persist && kv && !kv.getItem(ASKED_KEY)) {
      kv.setItem(ASKED_KEY, "1");
      const already = sm.persisted ? await sm.persisted() : false;
      if (!already) await sm.persist();
    }
  } catch {
    /* sem suporte */
  }
  try {
    return isQuotaLow(sm.estimate ? await sm.estimate() : null);
  } catch {
    return false;
  }
}
