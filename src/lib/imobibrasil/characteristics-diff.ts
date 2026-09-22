import { normalizeRichText, RICH_TEXT_KEYS } from "./payload-diff";
/**
 * Características por diferença (puro, sem I/O).
 *
 * `confirmed` = conjunto que o Gestão já associou naquele anúncio.
 * `desired`   = conjunto atual do imóvel, resolvido no catálogo daquele destino.
 *
 * Só se remove o que o Gestão associou antes: associação feita direto no painel
 * do site nunca é desfeita por nós. E a remoção usa o endpoint que desassocia a
 * característica DAQUELE imóvel — nunca o que apaga do catálogo global.
 */
export type CharacteristicsDiff = {
  toInsert: string[];
  toRemove: string[];
  toKeep: string[];
};

export function diffCharacteristics(
  confirmed: readonly unknown[] | null | undefined,
  desired: readonly unknown[] | null | undefined,
): CharacteristicsDiff {
  const before = normalizeCodes(confirmed);
  const after = normalizeCodes(desired);
  return {
    toInsert: after.filter((code) => !before.includes(code)),
    toRemove: before.filter((code) => !after.includes(code)),
    toKeep: after.filter((code) => before.includes(code)),
  };
}

export function normalizeCodes(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const code = String(value ?? "").trim();
    if (code) seen.add(code);
  }
  return Array.from(seen);
}

/** Conjunto confirmado após a rodada: o que sobrou + o que entrou de fato. */
export function nextConfirmedSet(
  confirmed: readonly unknown[] | null | undefined,
  inserted: readonly string[],
  removed: readonly string[],
): string[] {
  const before = normalizeCodes(confirmed).filter((code) => !removed.includes(code));
  return Array.from(new Set([...before, ...normalizeCodes(inserted)]));
}

/** Comparação do que o site confirmou campo a campo. */
export type FieldVerification = {
  sent: string[];
  confirmed: string[];
  divergent: string[];
  unverifiable: string[];
};

export function verifyFields(
  sent: Record<string, unknown>,
  remoteSnapshot: Record<string, unknown>,
  same: (a: unknown, b: unknown) => boolean,
): FieldVerification {
  const result: FieldVerification = { sent: [], confirmed: [], divergent: [], unverifiable: [] };
  for (const key of Object.keys(sent)) {
    result.sent.push(key);
    if (!(key in remoteSnapshot)) {
      // A leitura do site não descreve este campo: estado explícito, não sucesso.
      result.unverifiable.push(key);
      continue;
    }
    const ok = RICH_TEXT_KEYS.has(key)
      ? normalizeRichText(remoteSnapshot[key]) === normalizeRichText(sent[key])
      : same(remoteSnapshot[key], sent[key]);
    if (ok) result.confirmed.push(key);
    else result.divergent.push(key);
  }
  return result;
}
