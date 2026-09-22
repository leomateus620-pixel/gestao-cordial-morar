import type { PayloadSnapshot } from "./payload-diff";

/**
 * Referência de comparação após um envio: parte do que já estava confirmado e
 * acrescenta só os campos que a leitura do site comprovou.
 */
export function confirmedSnapshotAfterSend(input: {
  mode: string;
  base: PayloadSnapshot | null;
  full: PayloadSnapshot;
  sent: PayloadSnapshot;
  sentKeys: string[];
  notConfirmed: Set<string>;
}): PayloadSnapshot {
  const source = input.mode === "insert" ? input.full : input.sent;
  const keys = input.mode === "insert" ? Object.keys(input.full) : input.sentKeys;
  const next: PayloadSnapshot = input.mode === "insert" ? {} : { ...(input.base ?? {}) };
  for (const key of keys) {
    if (input.notConfirmed.has(key)) {
      delete next[key];
      continue;
    }
    next[key] = source[key];
  }
  return next;
}
