/**
 * Divergência ENTRE contas (Cordial x Morar) para o mesmo imóvel interno.
 *
 * Um campo mudou neste site (valor novo ≠ referência confirmada deste site) e
 * a outra conta tem um valor diferente do ponto de partida E diferente do valor
 * novo: as duas contas mudaram o campo de jeitos incompatíveis. Não existe
 * precedência definida entre as duas, então o Gestão mantém o seu valor e o
 * caso é registrado — a ordem das importações nunca decide quem vence.
 */
import { sameValue, type PayloadSnapshot } from "./payload-diff";

export type CrossAccountConflict = {
  field: string;
  local: unknown;
  thisRemote: unknown;
  otherRemote: unknown;
};

export function findCrossAccountConflicts(input: {
  fields: string[];
  thisConfirmed: PayloadSnapshot | null | undefined;
  thisRemote: PayloadSnapshot;
  otherRemote: PayloadSnapshot | null | undefined;
  local: PayloadSnapshot;
}): CrossAccountConflict[] {
  const out: CrossAccountConflict[] = [];
  if (!input.otherRemote) return out;
  for (const field of input.fields) {
    if (!(field in input.thisRemote) || !(field in input.otherRemote)) continue;
    const base = input.thisConfirmed?.[field];
    if (base === undefined) continue;
    const mine = input.thisRemote[field];
    const other = input.otherRemote[field];
    if (sameValue(base, mine)) continue; // este site não mudou
    if (sameValue(base, other)) continue; // a outra conta não mudou
    if (sameValue(mine, other)) continue; // mudaram igual: convergência
    out.push({ field, local: input.local[field], thisRemote: mine, otherRemote: other });
  }
  return out;
}
