import type { PublicProperty } from "./contract";

export const HOME_FEATURED_LIMIT = 5;
export const HOME_MORE_LIMIT = 15;
export type FeaturedMode = "recentes" | "editorial";

const hasCover = (p: PublicProperty) => p.cover != null;

/**
 * Escolhe os cinco destaques da home. Só entram imóveis com capa.
 * Editorial: respeita a ordem escolhida e completa vagas inválidas com os mais recentes.
 */
export function selectFeatured(input: {
  mode: FeaturedMode;
  editorialIds: string[];
  editorial: PublicProperty[];
  recent: PublicProperty[];
  limit?: number;
  /** Vagas reservadas por finalidade entre os recentes (0 = sem preferência). */
  mix?: { venda: number; aluguel: number };
}): PublicProperty[] {
  const limit = input.limit ?? HOME_FEATURED_LIMIT;
  const out: PublicProperty[] = [];
  const seen = new Set<string>();
  const push = (p: PublicProperty | undefined) => {
    if (!p || seen.has(p.id) || !hasCover(p) || out.length >= limit) return;
    seen.add(p.id);
    out.push(p);
  };
  if (input.mode === "editorial") {
    const byId = new Map(input.editorial.map((p) => [p.id, p]));
    for (const id of input.editorialIds.slice(0, limit)) push(byId.get(id));
  }
  const mix = input.mix ?? { venda: 0, aluguel: 0 };
  for (const op of ["venda", "aluguel"] as const) {
    let need = mix[op] - out.filter((p) => p.operation === op).length;
    for (const p of input.recent) {
      if (need <= 0) break;
      if (p.operation !== op || seen.has(p.id) || !hasCover(p)) continue;
      push(p);
      need--;
    }
  }
  for (const p of input.recent) push(p);
  // Mantém a ordem de publicação entre os recentes após reservar as vagas.
  if (input.mode !== "editorial") {
    const rank = new Map(input.recent.map((p, i) => [p.id, i]));
    out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }
  return out;
}

/** Quinze imóveis adicionais, sem repetir os destaques nem entre si. */
export function selectMore(
  pages: PublicProperty[][],
  excludeIds: Iterable<string>,
  limit = HOME_MORE_LIMIT,
): PublicProperty[] {
  const seen = new Set(excludeIds);
  const out: PublicProperty[] = [];
  for (const page of pages)
    for (const p of page) {
      if (out.length >= limit) return out;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  return out;
}

/** Itens da seleção editorial antiga que passam do limite de cinco. */
export const editorialOverflow = (ids: string[], limit = HOME_FEATURED_LIMIT) => ids.slice(limit);
