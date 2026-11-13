/**
 * Situação do imóvel no catálogo, espelhando `shared_selection_property_eligible`
 * do banco e a coluna `situacao_rank` da view `properties_catalog`.
 */

export type PropertySituacao = "disponivel" | "desativado" | "arquivado";
export type CatalogSituacao = "todos" | "disponiveis" | "desativados" | "arquivados";

/** Valores de disponibilidade que contam como disponível (mesma lista do banco). */
export const DISPONIBILIDADE_DISPONIVEL = ["", "sim", "disponível", "disponivel"] as const;

export function normalizeDisponibilidade(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export type SituacaoInput = {
  archivedAt?: string | null;
  isDraft?: boolean | null;
  exibirImovel?: boolean | null;
  disponibilidade?: string | null;
};

/** Arquivado vence desativado; rascunho conta como disponível (tem etiqueta própria). */
export function propertySituacao(p: SituacaoInput): PropertySituacao {
  if (p.archivedAt) return "arquivado";
  if (p.isDraft) return "disponivel";
  if (p.exibirImovel === false) return "desativado";
  const disp = normalizeDisponibilidade(p.disponibilidade);
  if (!(DISPONIBILIDADE_DISPONIVEL as readonly string[]).includes(disp)) return "desativado";
  return "disponivel";
}

export function situacaoRank(situacao: PropertySituacao): 0 | 1 | 2 {
  return situacao === "arquivado" ? 2 : situacao === "desativado" ? 1 : 0;
}

export function situacaoFromRank(rank: unknown): PropertySituacao | null {
  if (rank === 2) return "arquivado";
  if (rank === 1) return "desativado";
  if (rank === 0) return "disponivel";
  return null;
}

/** Rank filtrado por cada opção do chip "Situação" (null = sem filtro). */
export function situacaoFilterRank(filter: CatalogSituacao | null | undefined): 0 | 1 | 2 | null {
  if (filter === "disponiveis") return 0;
  if (filter === "desativados") return 1;
  if (filter === "arquivados") return 2;
  return null;
}

/** Ordena por grupo (disponíveis → desativados → arquivados) preservando a ordem interna. */
export function sortBySituacao<T extends SituacaoInput>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, rank: situacaoRank(propertySituacao(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

export const SITUACAO_LABEL: Record<Exclude<PropertySituacao, "disponivel">, string> = {
  desativado: "Desativado",
  arquivado: "Arquivado",
};
