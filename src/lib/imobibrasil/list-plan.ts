/**
 * Ordem da leitura completa: todas as páginas de ativos e depois todas as de
 * inativos. Leitura que falha não avança e nunca é tratada como ausência.
 */
export type ListStatus = "ativo" | "inativo";

export type ListStep =
  | { kind: "page"; status: ListStatus; page: number; key: string }
  | { kind: "finalize"; key: "finalize" };

export function listPageKey(status: ListStatus, page: number): string {
  // Ativos mantêm a chave antiga ("page:N") para retomar execuções em curso.
  return status === "ativo" ? `page:${page}` : `inativo:page:${page}`;
}

export function nextListStep(input: { status: ListStatus; page: number; totalPages: number }): ListStep {
  const total = Math.max(input.totalPages, input.page);
  if (input.page < total) {
    const page = input.page + 1;
    return { kind: "page", status: input.status, page, key: listPageKey(input.status, page) };
  }
  if (input.status === "ativo") {
    return { kind: "page", status: "inativo", page: 1, key: listPageKey("inativo", 1) };
  }
  return { kind: "finalize", key: "finalize" };
}
