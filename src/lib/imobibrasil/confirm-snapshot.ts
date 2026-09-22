import type { PayloadSnapshot } from "./payload-diff";
import { sameValue } from "./payload-diff";
import { LOCAL_FIELD_MAP, normalizeLocalField } from "./update-contract";

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
      // Não confirmado: mantém a ÚLTIMA confirmação conhecida (alteração) ou
      // fica fora (inclusão). Nunca apaga a referência — sem ela uma limpeza
      // recusada deixaria de ser reenviada.
      continue;
    }
    next[key] = source[key];
  }
  return next;
}

/**
 * A importação compara colunas locais, enquanto o envio compara chaves da API.
 * Só avança a base de uma coluna quando a leitura confirmou todas as chaves
 * enviadas para ela E o valor normalizado observado coincide com o desejado.
 * Uma alteração remota em campo não enviado continua visível à importação.
 */
export function confirmedLocalFieldsAfterSend(input: {
  mode: "insert" | "update";
  base: PayloadSnapshot | null;
  local: Record<string, unknown>;
  observed: Record<string, unknown>;
  confirmedPayloadKeys: string[];
  changedPayloadKeys: string[];
}): PayloadSnapshot {
  const next: PayloadSnapshot = { ...(input.base ?? {}) };
  const confirmed = new Set(input.confirmedPayloadKeys);
  const changed = new Set(input.changedPayloadKeys);
  for (const [column, remoteValue] of Object.entries(input.observed)) {
    if (remoteValue === null || remoteValue === undefined || !(column in input.local)) continue;
    const spec = LOCAL_FIELD_MAP[normalizeLocalField(column)];
    if (input.mode === "update") {
      if (!spec?.keys.length || !spec.keys.some((key) => changed.has(key))) continue;
      if (!spec.keys.every((key) => confirmed.has(key))) continue;
    }
    if (!sameValue(input.local[column], remoteValue, column)) continue;
    next[column] = remoteValue;
  }
  return next;
}
