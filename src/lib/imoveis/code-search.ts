/** Busca exata por código de imóvel (Cordial/Morar), sem efeitos colaterais. */

export type CodeCarteira = "todas" | "cordial" | "morar" | "ambas";
export type CodeColumn = "codigo_cordial" | "codigo_morar";

export const MAX_PROPERTY_CODE_DIGITS = 8;

/**
 * Normaliza o que a pessoa digitou: tira espaços, um "#" inicial e zeros à
 * esquerda. Só aceita dígitos (até 8); qualquer outra coisa devolve null.
 */
export function normalizePropertyCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.replace(/\s+/g, "");
  if (value.startsWith("#")) value = value.slice(1);
  if (!/^\d+$/.test(value)) return null;
  value = value.replace(/^0+/, "");
  if (!value || value.length > MAX_PROPERTY_CODE_DIGITS) return null;
  return value;
}

/** Colunas comparadas conforme a marca escolhida no topo. O código legado nunca entra. */
export function codeColumnsFor(carteira: CodeCarteira | undefined | null): CodeColumn[] {
  if (carteira === "cordial") return ["codigo_cordial"];
  if (carteira === "morar") return ["codigo_morar"];
  return ["codigo_cordial", "codigo_morar"];
}

/** Coluna da outra marca, para sugerir quando a busca por marca não acha nada. */
export function otherBrandFor(
  carteira: CodeCarteira | undefined | null,
): "cordial" | "morar" | null {
  if (carteira === "cordial") return "morar";
  if (carteira === "morar") return "cordial";
  return null;
}

/** "código 1442", "código Cordial 1442" ou "código Morar 1442". */
export function codeSearchLabel(code: string, carteira: CodeCarteira | undefined | null): string {
  if (carteira === "cordial") return `código Cordial ${code}`;
  if (carteira === "morar") return `código Morar ${code}`;
  return `código ${code}`;
}
