import type { SiteSearch, SiteSettings } from "./contract";

type SearchCfg = Partial<Pick<SiteSettings, "searchDefaultOrder" | "searchTypes">> | undefined;

/** Na busca da página inicial, "recentes" (não escolhido) vira a ordenação padrão do painel. */
export function defaultOrder(current: SiteSearch["ordem"], compact: boolean, settings: SearchCfg) {
  return compact && current === "recentes" ? (settings?.searchDefaultOrder ?? "recentes") : current;
}

/** Tipos oferecidos por finalidade; lista vazia no painel = todos os tipos disponíveis. */
export function allowedTypes<T extends { value: string }>(
  types: readonly T[],
  finalidade: string | undefined,
  settings: SearchCfg,
): T[] {
  const allow =
    finalidade === "venda" || finalidade === "aluguel"
      ? settings?.searchTypes?.[finalidade]
      : undefined;
  if (!allow?.length) return [...types];
  const set = new Set(allow.map((t) => t.toLowerCase()));
  return types.filter((t) => set.has(t.value.toLowerCase()));
}
